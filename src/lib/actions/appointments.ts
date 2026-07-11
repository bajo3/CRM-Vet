"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import type { AppointmentStatus } from "@prisma/client";
import { getPrisma } from "../prisma";
import { getSession, hasRole } from "../auth/session";
import { AGENDA_MANAGE_ROLES } from "../auth/roles";
import { createAppointment, rescheduleAppointment, updateAppointmentStatus } from "../services/appointments";
import { getAvailableSlots } from "../services/availability";
import { AppointmentConflictError } from "../services/errors";
import { appointmentFormSchema, rescheduleFormSchema, type AppointmentFormInput, type RescheduleFormInput } from "../validation/appointment";
import type { ActionResult, ActionFailure } from "./types";

const NOT_AUTHORIZED: ActionFailure = { ok: false, message: "No tenés permisos para esta acción." };
const NO_SESSION: ActionFailure = { ok: false, message: "Tu sesión expiró. Iniciá sesión nuevamente." };
const CONFLICT: ActionFailure = { ok: false, message: "Ese horario acaba de ocuparse. Elegí otro." };

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function toUtc(date: string, time: string, timezone: string): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone: timezone }).toUTC().toJSDate();
}

function revalidateAgenda(appointmentId?: string, petId?: string) {
  revalidatePath("/agenda");
  revalidatePath("/");
  if (appointmentId) revalidatePath(`/agenda/${appointmentId}`);
  if (petId) revalidatePath(`/clientes/mascotas/${petId}`);
}

/**
 * Horarios disponibles reales para un veterinario en una fecha, para poblar el selector del
 * formulario. `excludeAppointmentId` se pasa al reprogramar, para que el turno actual no se
 * excluya a sí mismo de las opciones.
 */
export async function getAvailableSlotsAction(
  veterinarianId: string,
  date: string,
  excludeAppointmentId?: string
): Promise<{ ok: true; slots: string[] } | ActionFailure> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!veterinarianId || !date) return { ok: true, slots: [] };

  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({ where: { id: session.clinicId } });
  if (!clinic) return { ok: false, message: "No encontramos la clínica." };

  const vetMember = await prisma.clinicMember.findFirst({
    where: { clinicId: session.clinicId, userId: veterinarianId, role: "VETERINARIAN", active: true },
  });
  if (!vetMember) return { ok: false, message: "Elegí un veterinario válido." };

  const slots = await getAvailableSlots(clinic, veterinarianId, date, excludeAppointmentId);
  return { ok: true, slots };
}

export type CreateAppointmentResult = ActionResult<{ id: string }>;

/** Crea un turno desde el formulario de agenda. Sólo OWNER/ADMIN/RECEPTIONIST. */
export async function createAppointmentAction(input: AppointmentFormInput): Promise<CreateAppointmentResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, AGENDA_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = appointmentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({ where: { id: session.clinicId } });
  if (!clinic) return { ok: false, message: "No encontramos la clínica." };

  const startAt = toUtc(parsed.data.date, parsed.data.time, clinic.timezone);
  const endAt = new Date(startAt.getTime() + clinic.defaultAppointmentDuration * 60_000);

  try {
    const appointment = await createAppointment({
      clinicId: session.clinicId,
      petId: parsed.data.petId,
      veterinarianId: parsed.data.veterinarianId,
      reason: parsed.data.reason,
      startAt,
      endAt,
      source: "CRM",
      createdById: session.userId,
    });
    revalidateAgenda(appointment.id, parsed.data.petId);
    return { ok: true, id: appointment.id };
  } catch (error) {
    if (error instanceof AppointmentConflictError) return CONFLICT;
    if (error instanceof Error && error.message === "PET_NOT_FOUND") {
      return { ok: false, message: "La mascota elegida no pertenece a esta clínica.", fieldErrors: { petId: "Elegí una mascota válida." } };
    }
    if (error instanceof Error && error.message === "VETERINARIAN_NOT_FOUND") {
      return { ok: false, message: "Elegí un veterinario válido.", fieldErrors: { veterinarianId: "Elegí un veterinario válido." } };
    }
    throw error;
  }
}

export type RescheduleAppointmentResult = ActionResult;

/** Reprograma un turno existente a nueva fecha/hora. Sólo OWNER/ADMIN/RECEPTIONIST. */
export async function rescheduleAppointmentAction(appointmentId: string, input: RescheduleFormInput): Promise<RescheduleAppointmentResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, AGENDA_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = rescheduleFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  const existing = await prisma.appointment.findFirst({ where: { id: appointmentId, clinicId: session.clinicId }, include: { pet: true } });
  if (!existing) return { ok: false, message: "No encontramos ese turno." };

  const clinic = await prisma.clinic.findUnique({ where: { id: session.clinicId } });
  if (!clinic) return { ok: false, message: "No encontramos la clínica." };

  const startAt = toUtc(parsed.data.date, parsed.data.time, clinic.timezone);
  const endAt = new Date(startAt.getTime() + clinic.defaultAppointmentDuration * 60_000);

  try {
    await rescheduleAppointment({ clinicId: session.clinicId, appointmentId, startAt, endAt, changedById: session.userId });
    revalidateAgenda(appointmentId, existing.petId);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppointmentConflictError) return CONFLICT;
    throw error;
  }
}

export type UpdateAppointmentStatusResult = ActionResult;

/** Variante de `updateAppointmentStatusAction` para usar como `action` de un `<form>` (bind), que no puede devolver un valor. */
export async function updateAppointmentStatusFormAction(appointmentId: string, status: AppointmentStatus): Promise<void> {
  await updateAppointmentStatusAction(appointmentId, status);
}

const VET_ALLOWED_STATUSES: AppointmentStatus[] = ["CONFIRMED", "ATTENDED", "NO_SHOW"];

/**
 * Cambia el estado de un turno. OWNER/ADMIN/RECEPTIONIST pueden cambiar a cualquier estado.
 * VETERINARIAN sólo puede confirmar/marcar atendido/marcar ausente en turnos propios (no cancelar).
 */
export async function updateAppointmentStatusAction(appointmentId: string, status: AppointmentStatus): Promise<UpdateAppointmentStatusResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;

  const prisma = getPrisma();
  const existing = await prisma.appointment.findFirst({ where: { id: appointmentId, clinicId: session.clinicId } });
  if (!existing) return { ok: false, message: "No encontramos ese turno." };

  const isManager = hasRole(session, AGENDA_MANAGE_ROLES);
  const isOwnVetAction = session.role === "VETERINARIAN" && existing.veterinarianId === session.userId && VET_ALLOWED_STATUSES.includes(status);
  if (!isManager && !isOwnVetAction) return NOT_AUTHORIZED;

  try {
    await updateAppointmentStatus({ clinicId: session.clinicId, appointmentId, status, changedById: session.userId });
    revalidateAgenda(appointmentId, existing.petId);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppointmentConflictError) return CONFLICT;
    throw error;
  }
}
