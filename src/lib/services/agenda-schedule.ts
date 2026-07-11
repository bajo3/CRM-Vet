import { DateTime } from "luxon";

/**
 * Devuelve la fecha ISO (YYYY-MM-DD) del lunes de la semana que contiene `dateISO`,
 * en la zona horaria de la clínica. Semana de lunes a domingo.
 */
export function getWeekStart(dateISO: string, timezone: string): string {
  const day = DateTime.fromISO(dateISO, { zone: timezone });
  const valid = day.isValid ? day : DateTime.now().setZone(timezone);
  return valid.startOf("week").toFormat("yyyy-MM-dd");
}

/** Devuelve las 7 fechas ISO (lunes a domingo) de la semana que empieza en `weekStartISO`. */
export function getWeekDates(weekStartISO: string, timezone: string): string[] {
  const start = DateTime.fromISO(weekStartISO, { zone: timezone });
  if (!start.isValid) return [];
  return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }).toFormat("yyyy-MM-dd"));
}

/** Suma/resta días a una fecha ISO, en la zona horaria de la clínica. */
export function shiftDate(dateISO: string, days: number, timezone: string): string {
  const day = DateTime.fromISO(dateISO, { zone: timezone });
  const valid = day.isValid ? day : DateTime.now().setZone(timezone);
  return valid.plus({ days }).toFormat("yyyy-MM-dd");
}

/** Fecha de hoy en formato ISO (YYYY-MM-DD), en la zona horaria de la clínica. */
export function todayISO(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");
}

/** Devuelve el rango UTC [inicio, fin) de un día ISO en la zona horaria de la clínica. */
export function dayRangeUtc(dateISO: string, timezone: string): { start: Date; end: Date } {
  const day = DateTime.fromISO(dateISO, { zone: timezone });
  return { start: day.startOf("day").toUTC().toJSDate(), end: day.endOf("day").toUTC().toJSDate() };
}

/** Combina las horas teóricas de varios días con los horarios reales de turnos existentes ese día,
 * para no perder turnos que no calzan exactamente con la grilla (p.ej. duración distinta a la actual). */
export function mergeSlotTimes(theoretical: string[], actual: string[]): string[] {
  return Array.from(new Set([...theoretical, ...actual])).sort();
}
