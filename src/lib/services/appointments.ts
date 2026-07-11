import { AppointmentSource, AppointmentStatus, Prisma } from "@prisma/client";
import { getPrisma } from "../prisma";
import { assertSlotFree } from "./availability";
import { AppointmentConflictError, isAvailabilityConflict } from "./errors";

const APPOINTMENT_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export type CreateAppointmentInput = {
  clinicId: string;
  petId: string;
  veterinarianId: string;
  reason: string;
  startAt: Date;
  endAt: Date;
  source?: AppointmentSource;
  createdById?: string | null;
};

export type RescheduleAppointmentInput = {
  clinicId: string;
  appointmentId: string;
  startAt: Date;
  endAt: Date;
  changedById?: string | null;
};

export type UpdateAppointmentStatusInput = {
  clinicId: string;
  appointmentId: string;
  status: AppointmentStatus;
  changedById?: string | null;
};

/**
 * Crea un turno dentro de una transacción Serializable: valida que la mascota y el veterinario
 * pertenezcan a la clínica, revalida el solapamiento, registra la actividad CREATED, cancela los
 * recordatorios CONTROL_DUE pendientes de la mascota (ya tiene turno agendado) y agenda el
 * recordatorio de turno 24hs antes (si esa fecha todavía es futura).
 */
export async function createAppointment(input: CreateAppointmentInput) {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(
      async (tx) => {
        const pet = await tx.pet.findFirst({ where: { id: input.petId, clinicId: input.clinicId } });
        if (!pet) throw new Error("PET_NOT_FOUND");

        const vetMember = await tx.clinicMember.findFirst({
          where: { clinicId: input.clinicId, userId: input.veterinarianId, role: "VETERINARIAN", active: true },
        });
        if (!vetMember) throw new Error("VETERINARIAN_NOT_FOUND");

        await assertSlotFree(tx, {
          clinicId: input.clinicId,
          veterinarianId: input.veterinarianId,
          startAt: input.startAt,
          endAt: input.endAt,
        });

        const appointment = await tx.appointment.create({
          data: {
            clinicId: input.clinicId,
            petId: input.petId,
            veterinarianId: input.veterinarianId,
            reason: input.reason,
            startAt: input.startAt,
            endAt: input.endAt,
            source: input.source ?? AppointmentSource.CRM,
            createdById: input.createdById ?? null,
          },
        });

        await tx.appointmentActivity.create({
          data: {
            clinicId: input.clinicId,
            appointmentId: appointment.id,
            userId: input.createdById ?? null,
            action: "CREATED",
            details: { source: appointment.source, veterinarianId: appointment.veterinarianId, startAt: appointment.startAt, endAt: appointment.endAt },
          },
        });

        // Ya tiene un turno agendado: los controles pendientes por WhatsApp/recepción quedan cancelados.
        await tx.reminder.updateMany({
          where: { clinicId: input.clinicId, petId: input.petId, type: "CONTROL_DUE", status: "PENDING" },
          data: { status: "CANCELLED" },
        });

        const reminderAt = new Date(appointment.startAt.getTime() - APPOINTMENT_REMINDER_LEAD_MS);
        if (reminderAt > new Date()) {
          await tx.reminder.create({
            data: {
              clinicId: input.clinicId,
              clientId: pet.clientId,
              petId: pet.id,
              appointmentId: appointment.id,
              type: "APPOINTMENT_REMINDER",
              scheduledAt: reminderAt,
              deduplicationKey: `appt:${appointment.id}:1d`,
            },
          });
        }

        return appointment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (isAvailabilityConflict(error)) throw new AppointmentConflictError();
    throw error;
  }
}

/**
 * Reprograma un turno existente: revalida disponibilidad para el nuevo horario, registra la
 * actividad RESCHEDULED con el detalle de fechas anteriores/nuevas, y cancela + regenera el
 * recordatorio de turno asociado.
 */
export async function rescheduleAppointment(input: RescheduleAppointmentInput) {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(
      async (tx) => {
        const appointment = await tx.appointment.findFirst({
          where: { id: input.appointmentId, clinicId: input.clinicId },
          include: { pet: true },
        });
        if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");

        await assertSlotFree(tx, {
          clinicId: input.clinicId,
          veterinarianId: appointment.veterinarianId,
          startAt: input.startAt,
          endAt: input.endAt,
          excludeAppointmentId: appointment.id,
        });

        const previous = { startAt: appointment.startAt, endAt: appointment.endAt };
        const updated = await tx.appointment.update({
          where: { id: appointment.id },
          data: { startAt: input.startAt, endAt: input.endAt },
        });

        await tx.appointmentActivity.create({
          data: {
            clinicId: input.clinicId,
            appointmentId: appointment.id,
            userId: input.changedById ?? null,
            action: "RESCHEDULED",
            details: { old: previous, new: { startAt: updated.startAt, endAt: updated.endAt } },
          },
        });

        const existingReminder = await tx.reminder.findFirst({
          where: { clinicId: input.clinicId, appointmentId: appointment.id, type: "APPOINTMENT_REMINDER", status: "PENDING" },
        });
        if (existingReminder) {
          await tx.reminder.update({
            where: { id: existingReminder.id },
            data: { status: "CANCELLED", deduplicationKey: `${existingReminder.deduplicationKey}:superseded:${existingReminder.id}` },
          });
        }

        const reminderAt = new Date(updated.startAt.getTime() - APPOINTMENT_REMINDER_LEAD_MS);
        if (reminderAt > new Date()) {
          await tx.reminder.create({
            data: {
              clinicId: input.clinicId,
              clientId: appointment.pet.clientId,
              petId: appointment.pet.id,
              appointmentId: updated.id,
              type: "APPOINTMENT_REMINDER",
              scheduledAt: reminderAt,
              deduplicationKey: `appt:${updated.id}:1d`,
            },
          });
        }

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (isAvailabilityConflict(error)) throw new AppointmentConflictError();
    throw error;
  }
}

/**
 * Cambia el estado de un turno y deja rastro en AppointmentActivity. Si el nuevo estado es
 * CANCELLED, cancela los recordatorios PENDING asociados a ese turno.
 */
export async function updateAppointmentStatus(input: UpdateAppointmentStatusInput) {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({ where: { id: input.appointmentId, clinicId: input.clinicId } });
      if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");
      if (appointment.status === input.status) return appointment;

      const updated = await tx.appointment.update({ where: { id: appointment.id }, data: { status: input.status } });

      await tx.appointmentActivity.create({
        data: {
          clinicId: input.clinicId,
          appointmentId: appointment.id,
          userId: input.changedById ?? null,
          action: "STATUS_CHANGED",
          details: { from: appointment.status, to: input.status },
        },
      });

      if (input.status === AppointmentStatus.CANCELLED) {
        await tx.reminder.updateMany({
          where: { clinicId: input.clinicId, appointmentId: appointment.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
      }

      return updated;
    });
  } catch (error) {
    if (isAvailabilityConflict(error)) throw new AppointmentConflictError();
    throw error;
  }
}
