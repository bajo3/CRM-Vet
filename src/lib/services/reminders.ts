import { DateTime } from "luxon";
import type { Client, Clinic, Pet, Reminder } from "@prisma/client";
import { getPrisma } from "../prisma";
import type { WhatsAppProvider } from "./whatsapp-provider";
import { DEFAULT_APPOINTMENT_REMINDER_TEMPLATE, DEFAULT_CONTROL_REMINDER_TEMPLATE, renderReminderTemplate } from "./reminder-templates";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 50;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type PrismaLike = ReturnType<typeof getPrisma>;

type ReminderOutcome = "sent" | "cancelled" | "failed" | "retried" | "skipped";

export type ProcessDueRemindersResult = Record<ReminderOutcome, number>;

function formatWhen(date: Date, timezone: string) {
  return DateTime.fromJSDate(date).setZone(timezone).setLocale("es").toFormat("cccc d 'de' LLLL 'a las' HH:mm");
}

/** Arma el texto del recordatorio de un turno próximo (24hs antes), usando el template de la clínica o el default. */
export function appointmentReminderMessage(params: { clientName: string; petName: string; clinicName: string; timezone: string; startAt: Date; template?: string | null }) {
  const template = params.template ?? DEFAULT_APPOINTMENT_REMINDER_TEMPLATE;
  return renderReminderTemplate(template, {
    cliente: params.clientName,
    mascota: params.petName,
    clinica: params.clinicName,
    fecha: formatWhen(params.startAt, params.timezone),
  });
}

/** Arma el texto del recordatorio de un control médico próximo a vencer, usando el template de la clínica o el default. */
export function controlDueReminderMessage(params: { clientName: string; petName: string; clinicName: string; timezone: string; dueDate: Date; reason: string; template?: string | null }) {
  const template = params.template ?? DEFAULT_CONTROL_REMINDER_TEMPLATE;
  const daysUntil = Math.max(0, Math.round((params.dueDate.getTime() - Date.now()) / MS_PER_DAY));
  return renderReminderTemplate(template, {
    cliente: params.clientName,
    mascota: params.petName,
    clinica: params.clinicName,
    fecha: formatWhen(params.dueDate, params.timezone),
    dias: String(daysUntil),
    motivo: params.reason,
  });
}

async function buildMessage(prisma: PrismaLike, reminder: Reminder, client: Client, pet: Pet, clinic: Clinic): Promise<string> {
  const shared = { clientName: client.name, petName: pet.name, clinicName: clinic.name, timezone: clinic.timezone };
  if (reminder.type === "APPOINTMENT_REMINDER") {
    const appointment = reminder.appointmentId ? await prisma.appointment.findUnique({ where: { id: reminder.appointmentId } }) : null;
    return appointmentReminderMessage({ ...shared, startAt: appointment?.startAt ?? reminder.scheduledAt, template: clinic.appointmentReminderTemplate });
  }
  const medicalRecord = reminder.medicalRecordId ? await prisma.medicalRecord.findUnique({ where: { id: reminder.medicalRecordId } }) : null;
  return controlDueReminderMessage({
    ...shared,
    dueDate: medicalRecord?.nextDueDate ?? reminder.scheduledAt,
    reason: medicalRecord?.reason ?? "control",
    template: clinic.controlReminderTemplate,
  });
}

async function recordOutboundMessage(prisma: PrismaLike, clinicId: string, client: Client, text: string, externalMessageId: string) {
  const conversation = await prisma.whatsappConversation.upsert({
    where: { clinicId_phone: { clinicId, phone: client.phone } },
    create: { clinicId, clientId: client.id, phone: client.phone },
    update: {},
  });
  await prisma.whatsappMessage.create({
    data: { clinicId, conversationId: conversation.id, direction: "OUTBOUND", content: text, messageType: "text", externalMessageId, status: "SENT" },
  });
}

async function cancel(prisma: PrismaLike, reminderId: string, errorMessage?: string): Promise<ReminderOutcome> {
  await prisma.reminder.update({ where: { id: reminderId }, data: { status: "CANCELLED", errorMessage: errorMessage ?? null } });
  return "cancelled";
}

/** Re-verifica las condiciones de un recordatorio ya reclamado, justo antes de enviarlo. */
async function stillDue(prisma: PrismaLike, reminder: Reminder, now: Date): Promise<boolean> {
  if (reminder.type === "CONTROL_DUE") {
    const activeAppointment = await prisma.appointment.findFirst({
      where: { clinicId: reminder.clinicId, petId: reminder.petId, status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: now } },
      select: { id: true },
    });
    if (activeAppointment) return false;
  }
  if (reminder.type === "APPOINTMENT_REMINDER") {
    if (!reminder.appointmentId) return false;
    const appointment = await prisma.appointment.findUnique({ where: { id: reminder.appointmentId } });
    if (!appointment || !(["PENDING", "CONFIRMED"] as const).includes(appointment.status as "PENDING" | "CONFIRMED")) return false;
  }
  return true;
}

async function handleReminder(prisma: PrismaLike, provider: WhatsAppProvider, reminder: Reminder, now: Date): Promise<ReminderOutcome> {
  const [client, pet, clinic] = await Promise.all([
    prisma.client.findUnique({ where: { id: reminder.clientId } }),
    prisma.pet.findUnique({ where: { id: reminder.petId } }),
    prisma.clinic.findUnique({ where: { id: reminder.clinicId } }),
  ]);
  if (!client || !pet || !clinic) return cancel(prisma, reminder.id, "Faltan datos relacionados");
  if (!client.remindersEnabled) return cancel(prisma, reminder.id);
  if (!(await stillDue(prisma, reminder, now))) return cancel(prisma, reminder.id);

  const text = await buildMessage(prisma, reminder, client, pet, clinic);

  try {
    const result = await provider.sendText({ clinicId: reminder.clinicId, phone: client.phone, text, clientId: client.id });
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: "SENT", sentAt: new Date(), externalMessageId: result.externalMessageId, errorMessage: null },
    });
    if (!result.messageAlreadyRecorded) {
      await recordOutboundMessage(prisma, reminder.clinicId, client, text, result.externalMessageId);
    }
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al enviar el recordatorio";
    if (reminder.attempts >= MAX_ATTEMPTS) {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "FAILED", failedAt: new Date(), errorMessage: message } });
      return "failed";
    }
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "PENDING", errorMessage: message } });
    return "retried";
  }
}

/**
 * Procesa los recordatorios vencidos (uno por vez, reclamado de forma atómica vía `updateMany`
 * condicionado a `status: PENDING`, para que dos ejecuciones concurrentes no envíen el mismo dos
 * veces). Antes de enviar, vuelve a validar que siga vigente. Los fallos incrementan `attempts`
 * hasta un máximo de 3, tras el cual el recordatorio queda FAILED definitivo; antes de eso vuelve
 * a PENDING para reintentar en la próxima corrida.
 */
export async function processDueReminders(provider: WhatsAppProvider, now: Date = new Date()): Promise<ProcessDueRemindersResult> {
  const prisma = getPrisma();
  const due = await prisma.reminder.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE,
  });

  const results: ProcessDueRemindersResult = { sent: 0, cancelled: 0, failed: 0, retried: 0, skipped: 0 };

  for (const reminder of due) {
    const claim = await prisma.reminder.updateMany({
      where: { id: reminder.id, status: "PENDING" },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count === 0) {
      results.skipped++;
      continue;
    }

    const current = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    if (!current) {
      results.skipped++;
      continue;
    }

    const outcome = await handleReminder(prisma, provider, current, now);
    results[outcome]++;
  }

  return results;
}
