import { getPrisma } from "../prisma";
import type { ScheduledMessage } from "@prisma/client";
import type { WhatsAppProvider } from "./whatsapp-provider";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 50;

type PrismaLike = ReturnType<typeof getPrisma>;

type ScheduledMessageOutcome = "sent" | "cancelled" | "failed" | "retried" | "skipped";

export type ProcessDueScheduledMessagesResult = Record<ScheduledMessageOutcome, number>;

async function recordOutboundMessage(prisma: PrismaLike, clinicId: string, clientId: string, phone: string, text: string, externalMessageId: string) {
  const conversation = await prisma.whatsappConversation.upsert({
    where: { clinicId_phone: { clinicId, phone } },
    create: { clinicId, clientId, phone },
    update: {},
  });
  await prisma.whatsappMessage.create({
    data: { clinicId, conversationId: conversation.id, direction: "OUTBOUND", content: text, messageType: "text", externalMessageId, status: "SENT" },
  });
}

async function cancel(prisma: PrismaLike, id: string, errorMessage?: string): Promise<ScheduledMessageOutcome> {
  await prisma.scheduledMessage.update({ where: { id }, data: { status: "CANCELLED", errorMessage: errorMessage ?? null } });
  return "cancelled";
}

/**
 * Envía un mensaje ya reclamado. A diferencia de `Reminder`, acá no hay una condición de "sigue
 * vigente" que revalidar (no depende de un turno o un control médico): es un texto libre que un
 * humano decidió mandar en una fecha puntual. Si el cliente o la clínica ya no existen (caso raro:
 * onDelete: Cascade debería haber borrado la fila junto con ellos) se cancela en vez de fallar.
 *
 * Nota de producto: `client.remindersEnabled` en `false` NO bloquea el envío acá. Ese flag es el
 * opt-out de los recordatorios automáticos (`Reminder`); un mensaje programado es una decisión
 * puntual y explícita de un integrante del equipo, no una campaña automática, así que no correspondía
 * ignorarla en silencio pisándole la fecha con un cancel. La UI de /mensajes ya avisa si el cliente
 * elegido tiene los recordatorios desactivados, para que quien programa el mensaje decida con esa
 * información a la vista.
 */
async function handleScheduledMessage(prisma: PrismaLike, provider: WhatsAppProvider, scheduled: ScheduledMessage): Promise<ScheduledMessageOutcome> {
  const client = await prisma.client.findUnique({ where: { id: scheduled.clientId } });
  if (!client) return cancel(prisma, scheduled.id, "El cliente ya no existe.");

  try {
    const result = await provider.sendText({ clinicId: scheduled.clinicId, phone: client.phone, text: scheduled.content, clientId: client.id });
    await prisma.scheduledMessage.update({
      where: { id: scheduled.id },
      data: { status: "SENT", sentAt: new Date(), externalMessageId: result.externalMessageId, errorMessage: null },
    });
    if (!result.messageAlreadyRecorded) {
      await recordOutboundMessage(prisma, scheduled.clinicId, client.id, client.phone, scheduled.content, result.externalMessageId);
    }
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al enviar el mensaje programado";
    if (scheduled.attempts >= MAX_ATTEMPTS) {
      await prisma.scheduledMessage.update({ where: { id: scheduled.id }, data: { status: "FAILED", errorMessage: message } });
      return "failed";
    }
    await prisma.scheduledMessage.update({ where: { id: scheduled.id }, data: { status: "PENDING", errorMessage: message } });
    return "retried";
  }
}

/**
 * Procesa los mensajes programados vencidos, con el mismo patrón de reclamo atómico que
 * `processDueReminders` (un `updateMany` condicionado a `status: PENDING` antes de tocar cada fila,
 * para que dos corridas concurrentes del worker no lo envíen dos veces). Hasta 3 intentos antes de
 * quedar `FAILED` definitivo.
 */
export async function processDueScheduledMessages(provider: WhatsAppProvider, now: Date = new Date()): Promise<ProcessDueScheduledMessagesResult> {
  const prisma = getPrisma();
  const due = await prisma.scheduledMessage.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE,
  });

  const results: ProcessDueScheduledMessagesResult = { sent: 0, cancelled: 0, failed: 0, retried: 0, skipped: 0 };

  for (const scheduled of due) {
    const claim = await prisma.scheduledMessage.updateMany({
      where: { id: scheduled.id, status: "PENDING" },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count === 0) {
      results.skipped++;
      continue;
    }

    const current = await prisma.scheduledMessage.findUnique({ where: { id: scheduled.id } });
    if (!current) {
      results.skipped++;
      continue;
    }

    const outcome = await handleScheduledMessage(prisma, provider, current);
    results[outcome]++;
  }

  return results;
}
