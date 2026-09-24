import { ConversationStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { reportOutboundDelivery } from "@/lib/services/whatsapp-outbound";
import { processIncomingWhatsappForClinic } from "./flow";

// Solo validamos los campos que usamos; Zernio agrega campos nuevos seguido y no queremos rechazar
// eventos válidos por eso (`passthrough` implícito de zod: las claves extra se ignoran).
const zernioMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().optional(),
  platform: z.string().optional(),
  platformMessageId: z.string().nullish(),
  direction: z.string().optional(),
  text: z.string().nullish(),
  attachments: z.array(z.object({ type: z.string().optional() })).nullish(),
  sender: z.object({ id: z.string().optional(), name: z.string().nullish(), phoneNumber: z.string().nullish() }).nullish(),
  sentAt: z.string().optional(),
  source: z.string().nullish(),
  metadata: z.object({ standby: z.boolean().optional() }).nullish(),
});

export const zernioWebhookSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  message: zernioMessageSchema.optional(),
  conversation: z.object({ id: z.string() }).nullish(),
  account: z.object({ id: z.string().optional(), accountId: z.string().optional() }).nullish(),
  // En `message.sent` el origen puede venir en la raíz o dentro de `message`.
  source: z.string().nullish(),
  timestamp: z.string().optional(),
});

export type ZernioWebhookEvent = z.infer<typeof zernioWebhookSchema>;

export type ZernioWebhookOutcome =
  | { handled: false; reason: string }
  | { handled: true; clinicId: string; kind: "incoming" | "echo" | "delivery"; queuedReply?: boolean };

const ATTACHMENT_LABELS: Record<string, string> = {
  image: "una imagen",
  video: "un video",
  audio: "un audio",
  file: "un archivo",
  sticker: "un sticker",
};

function describeIncomingText(message: NonNullable<ZernioWebhookEvent["message"]>): string {
  const text = message.text?.trim();
  if (text) return text.slice(0, 3000);
  const type = message.attachments?.[0]?.type;
  return `[El cliente envió ${type ? ATTACHMENT_LABELS[type] ?? "un adjunto" : "un mensaje sin texto"}]`;
}

function toIsoDate(value: string | undefined): string {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Procesa un evento de webhook de Zernio ya autenticado. Rutea por la cuenta de WhatsApp
 * (`account.accountId`) a la clínica que la tiene conectada; eventos de cuentas desconocidas o de
 * otras plataformas se ignoran sin error (Zernio reintentaría hasta 7 veces un no-2xx).
 */
export async function handleZernioWebhook(event: ZernioWebhookEvent): Promise<ZernioWebhookOutcome> {
  const prisma = getPrisma();
  const message = event.message;
  if (!message) return { handled: false, reason: "no_message" };
  if (message.platform && message.platform !== "whatsapp") return { handled: false, reason: "not_whatsapp" };

  const accountId = event.account?.accountId ?? event.account?.id;
  if (!accountId) return { handled: false, reason: "no_account" };
  const clinic = await prisma.clinic.findUnique({ where: { zernioAccountId: accountId } });
  if (!clinic || clinic.status !== "APPROVED") return { handled: false, reason: "unknown_account" };

  if (event.event === "message.received") {
    if (message.direction && message.direction !== "incoming") return { handled: false, reason: "not_incoming" };
    // Meta Business Agent ya está contestando esta conversación: responder le quitaría el control.
    if (message.metadata?.standby) return { handled: false, reason: "standby" };
    const rawPhone = message.sender?.phoneNumber ?? message.sender?.id ?? "";
    const phone = normalizePhone(rawPhone);
    if (phone.length < 6) return { handled: false, reason: "no_phone" };

    let response;
    try {
      response = await processIncomingWhatsappForClinic(
        clinic,
        {
          eventId: message.id,
          phone,
          contactName: message.sender?.name?.slice(0, 120) || undefined,
          text: describeIncomingText(message),
          timestamp: toIsoDate(message.sentAt),
        },
        { zernioConversationId: event.conversation?.id ?? message.conversationId }
      );
    } catch (error) {
      // Liberamos la marca de deduplicación para que el reintento de Zernio vuelva a procesarlo.
      await prisma.webhookEvent
        .deleteMany({ where: { clinicId: clinic.id, externalEventId: message.id, processedAt: null } })
        .catch(() => undefined);
      throw error;
    }
    if (response.duplicate) return { handled: true, clinicId: clinic.id, kind: "incoming", queuedReply: false };
    return { handled: true, clinicId: clinic.id, kind: "incoming", queuedReply: Boolean(response.outboundMessageId) };
  }

  if (event.event === "message.sent") {
    // Mensajes que alguien del equipo escribió desde la app de WhatsApp Business del teléfono
    // (coexistencia). Los que manda el CRM (`cloud_api`) ya están registrados en la outbox.
    const source = message.source ?? event.source;
    if (source !== "whatsapp_business_app") return { handled: false, reason: "own_send" };
    const conversationId = event.conversation?.id ?? message.conversationId;
    const conversation = conversationId
      ? await prisma.whatsappConversation.findFirst({ where: { clinicId: clinic.id, zernioConversationId: conversationId } })
      : null;
    if (!conversation) return { handled: false, reason: "unknown_conversation" };
    try {
      await prisma.$transaction([
        prisma.whatsappMessage.create({
          data: {
            clinicId: clinic.id,
            conversationId: conversation.id,
            direction: "OUTBOUND",
            content: message.text?.trim() || "[Mensaje enviado desde el teléfono]",
            externalMessageId: message.id,
            status: "SENT",
          },
        }),
        // Si alguien respondió a mano desde el teléfono, el bot deja de contestar esa conversación.
        prisma.whatsappConversation.update({
          where: { id: conversation.id },
          data: { status: ConversationStatus.HUMAN_ACTIVE, lastMessageAt: new Date(), unreadCount: 0 },
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { handled: true, clinicId: clinic.id, kind: "echo" };
      }
      throw error;
    }
    return { handled: true, clinicId: clinic.id, kind: "echo" };
  }

  const deliveryStatus = { "message.delivered": "DELIVERED", "message.read": "READ", "message.failed": "FAILED" } as const;
  if (event.event in deliveryStatus) {
    const status = deliveryStatus[event.event as keyof typeof deliveryStatus];
    // El id que devolvió el envío puede ser el interno de Zernio o el `wamid` de Meta: probamos ambos.
    const candidates = [message.id, message.platformMessageId].filter((value): value is string => Boolean(value));
    for (const externalMessageId of candidates) {
      if (await reportOutboundDelivery(prisma, clinic.id, externalMessageId, status)) break;
    }
    return { handled: true, clinicId: clinic.id, kind: "delivery" };
  }

  return { handled: false, reason: "ignored_event" };
}
