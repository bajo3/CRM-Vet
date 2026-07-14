import { DateTime } from "luxon";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "../prisma";
import { AppointmentConflictError } from "./errors";

type TxClient = Prisma.TransactionClient | PrismaClient;

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Horario de apertura de la clínica: por día, una lista de rangos `[apertura, cierre]` en formato "HH:MM" (para contemplar horarios cortados como mañana/tarde), o ausente si cierra ese día. */
export type OpeningHours = Partial<Record<WeekdayKey, [string, string][]>>;

export type ClinicScheduleConfig = {
  id: string;
  timezone: string;
  openingHours: Prisma.JsonValue;
  defaultAppointmentDuration: number;
};

/** Normaliza también el formato viejo (un único rango `[apertura, cierre]` por día, sin envolver en lista). */
function parseOpeningHours(value: Prisma.JsonValue): OpeningHours {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const result: OpeningHours = {};
  for (const key of WEEKDAY_KEYS) {
    const day = raw[key];
    if (!Array.isArray(day) || day.length === 0) continue;
    const ranges = (typeof day[0] === "string" ? [day] : day) as [string, string][];
    result[key] = ranges;
  }
  return result;
}

function weekdayKey(date: DateTime): WeekdayKey {
  return WEEKDAY_KEYS[date.weekday - 1];
}

function toUtcDate(date: string, time: string, timezone: string) {
  return DateTime.fromISO(`${date}T${time}`, { zone: timezone }).toUTC().toJSDate();
}

/**
 * Calcula los horarios teóricos (HH:MM) de un día dado a partir de `openingHours` y la duración del turno.
 * No consulta la base: es una función pura reutilizada tanto para mostrar horarios como para validarlos.
 */
export function theoreticalSlotsForDay(openingHours: Prisma.JsonValue, date: string, timezone: string, durationMinutes: number): string[] {
  const parsed = parseOpeningHours(openingHours);
  const day = DateTime.fromISO(date, { zone: timezone });
  if (!day.isValid) return [];
  const ranges = parsed[weekdayKey(day)];
  if (!ranges || ranges.length === 0) return [];

  const slots: string[] = [];
  for (const [openTime, closeTime] of ranges) {
    const open = DateTime.fromISO(`${date}T${openTime}`, { zone: timezone });
    const close = DateTime.fromISO(`${date}T${closeTime}`, { zone: timezone });
    if (!open.isValid || !close.isValid || open >= close) continue;
    let cursor = open;
    while (cursor.plus({ minutes: durationMinutes }) <= close) {
      slots.push(cursor.toFormat("HH:mm"));
      cursor = cursor.plus({ minutes: durationMinutes });
    }
  }
  return slots;
}

/**
 * Horarios disponibles para un veterinario en una fecha: excluye horarios pasados y los que
 * se solapan con turnos PENDING/CONFIRMED existentes.
 *
 * `excludeAppointmentId` se usa al reprogramar: el turno que se está moviendo no debe contar como
 * "ocupado" contra sí mismo, si no su propio horario actual nunca aparecería como opción.
 */
export async function getAvailableSlots(
  clinic: ClinicScheduleConfig,
  veterinarianId: string,
  date: string,
  excludeAppointmentId?: string
): Promise<string[]> {
  const prisma = getPrisma();
  const slots = theoreticalSlotsForDay(clinic.openingHours, date, clinic.timezone, clinic.defaultAppointmentDuration);
  if (slots.length === 0) return [];

  const dayStart = DateTime.fromISO(date, { zone: clinic.timezone }).startOf("day").toUTC().toJSDate();
  const dayEnd = DateTime.fromISO(date, { zone: clinic.timezone }).endOf("day").toUTC().toJSDate();
  const booked = await prisma.appointment.findMany({
    where: {
      clinicId: clinic.id,
      veterinarianId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startAt: { lte: dayEnd },
      endAt: { gte: dayStart },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startAt: true, endAt: true },
  });

  const now = new Date();
  return slots.filter((time) => {
    const start = toUtcDate(date, time, clinic.timezone);
    const end = new Date(start.getTime() + clinic.defaultAppointmentDuration * 60_000);
    if (start <= now) return false;
    return !booked.some((appointment) => appointment.startAt < end && appointment.endAt > start);
  });
}

/**
 * Vuelve a comprobar que un horario esté libre dentro de una transacción, justo antes de reservar.
 * Lanza `AppointmentConflictError` si hay un turno PENDING/CONFIRMED solapado para el mismo veterinario.
 * Es una defensa adicional a la constraint de exclusión de base de datos, no un reemplazo.
 */
export async function assertSlotFree(
  tx: TxClient,
  params: { clinicId: string; veterinarianId: string; startAt: Date; endAt: Date; excludeAppointmentId?: string }
): Promise<void> {
  const overlap = await tx.appointment.findFirst({
    where: {
      clinicId: params.clinicId,
      veterinarianId: params.veterinarianId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
      ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
    },
    select: { id: true },
  });
  if (overlap) throw new AppointmentConflictError();
}
