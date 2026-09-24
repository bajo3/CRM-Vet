import { getPrisma } from "../prisma";
import { CUSTOMER_SERVICE_WINDOW_MS, isZernioConfigured, sendZernioWhatsappText } from "../whatsapp/zernio-client";
import { claimOutboundMessages, reportOutboundOutcome } from "./whatsapp-outbound";

type PrismaLike = ReturnType<typeof getPrisma>;

/**
 * Un mensaje que esperó más que esto en la cola (típicamente: recordatorios encolados antes de que la
 * clínica conectara WhatsApp) ya no se envía: "tu turno es mañana" dicho tres días tarde confunde.
 */
export const STALE_OUTBOUND_MS = 12 * 60 * 60 * 1000;

export type ZernioDispatchResult = { sent: number; failed: number };

/**
 * Canal de salida para las clínicas conectadas a Zernio: reclama los mensajes pendientes de la
 * outbox (los mismos `HUMAN_QUEUED` que en Baileys levanta el bridge) y los envía por la API de
 * Zernio. Se llama justo después de encolar (webhook entrante, respuesta humana) y además en cada
 * vuelta del worker de recordatorios, que funciona como barrido de reintentos.
 */
export async function dispatchZernioOutbox(prisma: PrismaLike, clinicId: string, limit = 20): Promise<ZernioDispatchResult> {
  const result: ZernioDispatchResult = { sent: 0, failed: 0 };
  if (!isZernioConfigured()) return result;

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { zernioAccountId: true } });
  if (!clinic?.zernioAccountId) return result;

  const claimed = await claimOutboundMessages(prisma, clinicId, limit);
  if (claimed.length === 0) return result;

  const conversations = await prisma.whatsappMessage.findMany({
    where: { id: { in: claimed.map((message) => message.id) } },
    select: { id: true, createdAt: true, conversation: { select: { id: true, lastInboundAt: true, zernioConversationId: true } } },
  });
  const conversationByMessage = new Map(conversations.map((row) => [row.id, row.conversation]));
  const createdAtByMessage = new Map(conversations.map((row) => [row.id, row.createdAt]));

  for (const message of claimed) {
    const conversation = conversationByMessage.get(message.id);
    const createdAt = createdAtByMessage.get(message.id);
    if (createdAt && Date.now() - createdAt.getTime() > STALE_OUTBOUND_MS) {
      await reportOutboundOutcome(prisma, clinicId, message.id, "FAILED", undefined, false);
      result.failed += 1;
      continue;
    }
    const windowOpen = Boolean(
      conversation?.lastInboundAt && Date.now() - conversation.lastInboundAt.getTime() < CUSTOMER_SERVICE_WINDOW_MS
    );
    const outcome = await sendZernioWhatsappText({
      accountId: clinic.zernioAccountId,
      phone: message.phone,
      text: message.content,
      conversationId: conversation?.zernioConversationId ?? null,
      windowOpen,
    });

    if (outcome.ok) {
      await reportOutboundOutcome(prisma, clinicId, message.id, "SENT", outcome.messageId);
      if (conversation && outcome.conversationId && outcome.conversationId !== conversation.zernioConversationId) {
        await prisma.whatsappConversation.updateMany({
          where: { id: conversation.id, clinicId },
          data: { zernioConversationId: outcome.conversationId },
        });
      }
      result.sent += 1;
    } else {
      await reportOutboundOutcome(prisma, clinicId, message.id, "FAILED", undefined, outcome.retryable);
      console.error("Zernio rechazó un mensaje saliente", { code: outcome.code, retryable: outcome.retryable });
      result.failed += 1;
    }
  }

  return result;
}

/** Barrido para el worker: despacha la outbox de todas las clínicas que usan Zernio. */
export async function dispatchAllZernioOutboxes(prisma: PrismaLike): Promise<ZernioDispatchResult> {
  const total: ZernioDispatchResult = { sent: 0, failed: 0 };
  if (!isZernioConfigured()) return total;
  const clinics = await prisma.clinic.findMany({
    where: { zernioAccountId: { not: null }, status: "APPROVED" },
    select: { id: true },
  });
  for (const clinic of clinics) {
    const partial = await dispatchZernioOutbox(prisma, clinic.id);
    total.sent += partial.sent;
    total.failed += partial.failed;
  }
  return total;
}
