import { DateTime } from "luxon";
import { getPrisma } from "../prisma";
import { theoreticalSlotsForDay } from "../services/availability";
import { dayRangeUtc, getWeekDates, mergeSlotTimes } from "../services/agenda-schedule";

/** Veterinarios activos de la clínica, para el filtro y el formulario de nuevo turno. */
export async function getActiveVeterinarians(clinicId: string) {
  const prisma = getPrisma();
  const members = await prisma.clinicMember.findMany({
    where: { clinicId, role: "VETERINARIAN", active: true },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((member) => ({ id: member.user.id, name: member.user.name }));
}

/** Configuración de agenda de la clínica: horarios de apertura, duración de turno y zona horaria. */
export async function getClinicScheduleConfig(clinicId: string) {
  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) return null;
  return clinic;
}

const APPOINTMENT_INCLUDE = { pet: { include: { client: true } }, veterinarian: true } as const;

/** Turnos del día (rango completo, todas las clínicas filtradas por clinicId), opcionalmente de un solo veterinario. */
export async function getAppointmentsForDay(clinicId: string, dateISO: string, timezone: string, veterinarianId?: string) {
  const prisma = getPrisma();
  const { start, end } = dayRangeUtc(dateISO, timezone);
  return prisma.appointment.findMany({
    where: {
      clinicId,
      startAt: { gte: start, lte: end },
      ...(veterinarianId ? { veterinarianId } : {}),
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: { startAt: "asc" },
  });
}

/** Turnos de una semana completa (lunes a domingo), opcionalmente de un solo veterinario. */
export async function getAppointmentsForWeek(clinicId: string, weekStartISO: string, timezone: string, veterinarianId?: string) {
  const prisma = getPrisma();
  const weekDates = getWeekDates(weekStartISO, timezone);
  if (weekDates.length === 0) return [];
  const start = dayRangeUtc(weekDates[0], timezone).start;
  const end = dayRangeUtc(weekDates[6], timezone).end;
  return prisma.appointment.findMany({
    where: {
      clinicId,
      startAt: { gte: start, lte: end },
      ...(veterinarianId ? { veterinarianId } : {}),
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: { startAt: "asc" },
  });
}

/** Horarios teóricos de la grilla del día, combinados con los horarios reales de turnos existentes (por si no calzan). */
export function buildDaySlots(openingHours: unknown, dateISO: string, timezone: string, durationMinutes: number, appointments: { startAt: Date }[]) {
  const theoretical = theoreticalSlotsForDay(openingHours as never, dateISO, timezone, durationMinutes);
  const actual = appointments.map((appointment) => DateTime.fromJSDate(appointment.startAt).setZone(timezone).toFormat("HH:mm"));
  return mergeSlotTimes(theoretical, actual);
}

/** Detalle completo de un turno: mascota, tutor, veterinario, quién lo creó, y su historial de actividad. */
export async function getAppointmentDetail(clinicId: string, appointmentId: string) {
  const prisma = getPrisma();
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
    include: { pet: { include: { client: true } }, veterinarian: true, createdBy: true },
  });
  if (!appointment) return null;

  const activities = await prisma.appointmentActivity.findMany({
    where: { clinicId, appointmentId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  return { appointment, activities };
}

export type AgendaAppointment = Awaited<ReturnType<typeof getAppointmentsForDay>>[number];

/** Mascotas de la clínica (con tutor), para el buscador del formulario de nuevo turno. */
export async function listPetsForAppointmentForm(clinicId: string) {
  const prisma = getPrisma();
  return prisma.pet.findMany({
    where: { clinicId },
    include: { client: true },
    orderBy: { name: "asc" },
  });
}
