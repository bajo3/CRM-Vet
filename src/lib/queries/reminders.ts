import type { ReminderStatus, ReminderType, Prisma } from "@prisma/client";
import { getPrisma } from "../prisma";

const REMINDER_LIMIT = 100;

export type ClinicReminder = {
  id: string;
  type: ReminderType;
  status: ReminderStatus;
  scheduledAt: Date;
  sentAt: Date | null;
  errorMessage: string | null;
  petId: string;
  petName: string;
  clientName: string;
  clientPhone: string;
  clientRemindersEnabled: boolean;
};

export type ClinicReminders = { upcoming: ClinicReminder[]; history: ClinicReminder[] };

const REMINDER_SELECT = {
  id: true,
  type: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
  errorMessage: true,
  pet: { select: { id: true, name: true } },
  client: { select: { name: true, phone: true, remindersEnabled: true } },
} satisfies Prisma.ReminderSelect;

type ReminderRow = Prisma.ReminderGetPayload<{ select: typeof REMINDER_SELECT }>;

function toClinicReminder(reminder: ReminderRow): ClinicReminder {
  return {
    id: reminder.id,
    type: reminder.type,
    status: reminder.status,
    scheduledAt: reminder.scheduledAt,
    sentAt: reminder.sentAt,
    errorMessage: reminder.errorMessage,
    petId: reminder.pet.id,
    petName: reminder.pet.name,
    clientName: reminder.client.name,
    clientPhone: reminder.client.phone,
    clientRemindersEnabled: reminder.client.remindersEnabled,
  };
}

/**
 * Recordatorios de la clínica para la vista de seguimiento: los próximos envíos pendientes
 * (ordenados por fecha de envío) y el historial reciente (enviados, fallidos o cancelados).
 */
export async function listClinicReminders(clinicId: string, search: string): Promise<ClinicReminders> {
  const prisma = getPrisma();
  const searchFilter: Prisma.ReminderWhereInput = search
    ? {
        OR: [
          { pet: { name: { contains: search, mode: "insensitive" } } },
          { client: { name: { contains: search, mode: "insensitive" } } },
        ],
      }
    : {};

  const [upcoming, history] = await Promise.all([
    prisma.reminder.findMany({
      where: { clinicId, status: "PENDING", ...searchFilter },
      select: REMINDER_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: REMINDER_LIMIT,
    }),
    prisma.reminder.findMany({
      where: { clinicId, status: { in: ["SENT", "FAILED", "CANCELLED"] }, ...searchFilter },
      select: REMINDER_SELECT,
      orderBy: { scheduledAt: "desc" },
      take: REMINDER_LIMIT,
    }),
  ]);

  return { upcoming: upcoming.map(toClinicReminder), history: history.map(toClinicReminder) };
}
