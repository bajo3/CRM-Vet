import type { Prisma, ScheduledMessageStatus } from "@prisma/client";
import { getPrisma } from "../prisma";

const SCHEDULED_MESSAGE_LIMIT = 100;

export type ClinicScheduledMessage = {
  id: string;
  content: string;
  scheduledAt: Date;
  status: ScheduledMessageStatus;
  sentAt: Date | null;
  errorMessage: string | null;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientRemindersEnabled: boolean;
  userName: string;
};

export type ClinicScheduledMessages = { upcoming: ClinicScheduledMessage[]; history: ClinicScheduledMessage[] };

const SCHEDULED_MESSAGE_SELECT = {
  id: true,
  content: true,
  scheduledAt: true,
  status: true,
  sentAt: true,
  errorMessage: true,
  client: { select: { id: true, name: true, phone: true, remindersEnabled: true } },
  user: { select: { name: true } },
} satisfies Prisma.ScheduledMessageSelect;

type ScheduledMessageRow = Prisma.ScheduledMessageGetPayload<{ select: typeof SCHEDULED_MESSAGE_SELECT }>;

function toClinicScheduledMessage(row: ScheduledMessageRow): ClinicScheduledMessage {
  return {
    id: row.id,
    content: row.content,
    scheduledAt: row.scheduledAt,
    status: row.status,
    sentAt: row.sentAt,
    errorMessage: row.errorMessage,
    clientId: row.client.id,
    clientName: row.client.name,
    clientPhone: row.client.phone,
    clientRemindersEnabled: row.client.remindersEnabled,
    userName: row.user.name,
  };
}

/**
 * Mensajes programados a mano de la clínica, para la pestaña "Programados" de /mensajes: los
 * próximos pendientes de envío y el historial reciente (enviados, fallidos o cancelados). Mismo
 * patrón que `listClinicReminders`, pero para `ScheduledMessage` en vez de `Reminder`.
 */
export async function listScheduledMessages(clinicId: string, search: string): Promise<ClinicScheduledMessages> {
  const prisma = getPrisma();
  const searchFilter: Prisma.ScheduledMessageWhereInput = search
    ? { client: { name: { contains: search, mode: "insensitive" } } }
    : {};

  const [upcoming, history] = await Promise.all([
    prisma.scheduledMessage.findMany({
      where: { clinicId, status: "PENDING", ...searchFilter },
      select: SCHEDULED_MESSAGE_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: SCHEDULED_MESSAGE_LIMIT,
    }),
    prisma.scheduledMessage.findMany({
      where: { clinicId, status: { in: ["SENT", "FAILED", "CANCELLED"] }, ...searchFilter },
      select: SCHEDULED_MESSAGE_SELECT,
      orderBy: { scheduledAt: "desc" },
      take: SCHEDULED_MESSAGE_LIMIT,
    }),
  ]);

  return { upcoming: upcoming.map(toClinicScheduledMessage), history: history.map(toClinicScheduledMessage) };
}

/**
 * Para cada cliente con al menos un `ScheduledMessage` PENDING, la fecha del más próximo. Se usa en
 * `/clientes` para mostrar el badge "Mensaje programado en X días" en su tarjeta. Un cliente puede
 * tener varios mensajes programados; solo importa el más cercano para el indicador.
 */
export async function getNextScheduledMessageByClient(clinicId: string): Promise<Map<string, Date>> {
  const prisma = getPrisma();
  const rows = await prisma.scheduledMessage.findMany({
    where: { clinicId, status: "PENDING" },
    select: { clientId: true, scheduledAt: true },
    orderBy: { scheduledAt: "asc" },
  });

  const map = new Map<string, Date>();
  for (const row of rows) {
    if (!map.has(row.clientId)) map.set(row.clientId, row.scheduledAt);
  }
  return map;
}
