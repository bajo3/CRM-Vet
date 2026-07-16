import { getPrisma } from "../prisma";

type PrismaLike = ReturnType<typeof getPrisma>;

/** Tras 3 intentos fallidos, el mensaje queda `FAILED` definitivo (mismo límite que usan los recordatorios). */
export const MAX_OUTBOUND_ATTEMPTS = 3;

export type ClaimedOutboundMessage = { id: string; phone: string; content: string };

/**
 * Reclama de forma atómica hasta `limit` mensajes pendientes de una clínica, pasándolos a
 * `SENDING`. Tanto el bot como el equipo crean mensajes `HUMAN_QUEUED`; el antiguo estado
 * `QUEUED` se conserva sólo como histórico sin confirmación para no reenviar conversaciones
 * previas al desplegar esta outbox. Reclamar mensaje por mensaje con un `updateMany` condicionado
 * asegura que, si dos llamadas corren en paralelo (por ejemplo el worker Baileys reintentando un
 * poll que tardó más de lo esperado), cada mensaje se le adjudique a una sola de las dos: la
 * segunda llamada obtiene `count: 0` para cualquier fila que la primera ya haya reclamado.
 */
export async function claimOutboundMessages(prisma: PrismaLike, clinicId: string, limit = 20): Promise<ClaimedOutboundMessage[]> {
  const candidates = await prisma.whatsappMessage.findMany({
    where: { clinicId, status: "HUMAN_QUEUED", direction: "OUTBOUND" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  if (candidates.length === 0) return [];

  const claimedIds: string[] = [];
  for (const candidate of candidates) {
    const result = await prisma.whatsappMessage.updateMany({
      where: { id: candidate.id, clinicId, status: "HUMAN_QUEUED" },
      data: { status: "SENDING" },
    });
    if (result.count === 1) claimedIds.push(candidate.id);
  }
  if (claimedIds.length === 0) return [];

  const messages = await prisma.whatsappMessage.findMany({
    where: { id: { in: claimedIds } },
    include: { conversation: { select: { phone: true } } },
  });
  const byId = new Map(messages.map((message) => [message.id, message]));
  return claimedIds
    .map((id) => byId.get(id))
    .filter((message): message is NonNullable<typeof message> => Boolean(message))
    .map((message) => ({ id: message.id, phone: message.conversation.phone, content: message.content }));
}

/** Registra una confirmación posterior de WhatsApp (entregado al dispositivo o leído). */
export async function reportOutboundDelivery(
  prisma: PrismaLike,
  clinicId: string,
  externalMessageId: string,
  status: "DELIVERED" | "READ"
): Promise<boolean> {
  const result = await prisma.whatsappMessage.updateMany({
    where: {
      clinicId,
      externalMessageId,
      direction: "OUTBOUND",
      status: { in: status === "READ" ? ["SENT", "DELIVERED", "READ"] : ["SENT", "DELIVERED"] },
    },
    data: { status },
  });
  return result.count > 0;
}

export type OutboundOutcome = "SENT" | "FAILED";

/**
 * Registra el resultado de un intento de envío de un mensaje previamente reclamado (`SENDING`).
 * En éxito, marca `SENT`. En falla, incrementa `attempts`: si todavía no llegó al máximo vuelve a
 * `HUMAN_QUEUED` para que el próximo poll lo reintente; al llegar al máximo, queda `FAILED`
 * definitivo. Siempre filtra por `clinicId` además de `id`, para que el reporte de una clínica
 * nunca pueda tocar un mensaje de otra.
 */
export async function reportOutboundOutcome(
  prisma: PrismaLike,
  clinicId: string,
  id: string,
  outcome: OutboundOutcome,
  externalMessageId?: string
): Promise<boolean> {
  if (outcome === "SENT") {
    const result = await prisma.whatsappMessage.updateMany({
      where: { id, clinicId },
      data: { status: "SENT", externalMessageId: externalMessageId ?? null },
    });
    return result.count > 0;
  }

  const message = await prisma.whatsappMessage.findFirst({ where: { id, clinicId }, select: { attempts: true } });
  if (!message) return false;

  const attempts = message.attempts + 1;
  const nextStatus = attempts >= MAX_OUTBOUND_ATTEMPTS ? "FAILED" : "HUMAN_QUEUED";
  const result = await prisma.whatsappMessage.updateMany({
    where: { id, clinicId },
    data: { status: nextStatus, attempts },
  });
  return result.count > 0;
}
