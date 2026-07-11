import { DateTime } from "luxon";

/**
 * Parser de fechas y horarios en lenguaje natural (es-AR) para el bot de WhatsApp.
 * Sin dependencias nuevas: sólo luxon + regex. Todas las funciones son puras y reciben
 * la hora "actual" como parámetro para poder testear sin depender del reloj real.
 */

const WEEKDAY_NAMES: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 7,
};

const WEEKDAY_LABELS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Quita acentos/diacríticos y pasa a minúsculas para simplificar el matching ("miércoles" -> "miercoles"). */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function isValidDay(day: DateTime): boolean {
  return day.isValid;
}

/**
 * Busca una fecha en lenguaje natural dentro de `text` (puede ser una frase completa, no sólo
 * la fecha) y devuelve su ISO date ("AAAA-MM-DD") en la zona horaria de la clínica, o `null` si
 * no se pudo reconocer ninguna fecha. Reconoce: "hoy", "mañana"/"manana", "pasado mañana",
 * días de la semana ("el lunes", "miercoles", "sábado" sin tilde), "15/7", "15-07", "15/07/2026"
 * y el formato legacy AAAA-MM-DD.
 */
export function parseNaturalDate(text: string, timezone: string, now: DateTime = DateTime.now().setZone(timezone)): string | null {
  const today = now.setZone(timezone).startOf("day");
  const norm = normalizeText(text);

  // 1) ISO legacy: AAAA-MM-DD (más específico, se revisa primero para no chocar con dd/mm).
  const isoMatch = norm.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const candidate = DateTime.fromISO(`${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`, { zone: timezone });
    if (isValidDay(candidate)) return candidate.toFormat("yyyy-MM-dd");
  }

  // 2) "pasado mañana" (antes que "mañana" para no matchear primero el caso simple).
  if (/pasado\s+man?ana/.test(norm)) {
    return today.plus({ days: 2 }).toFormat("yyyy-MM-dd");
  }

  // 3) "mañana" / "manana"
  if (/\bman?ana\b/.test(norm)) {
    return today.plus({ days: 1 }).toFormat("yyyy-MM-dd");
  }

  // 4) "hoy"
  if (/\bhoy\b/.test(norm)) {
    return today.toFormat("yyyy-MM-dd");
  }

  // 5) Días de la semana: "el lunes", "proximo lunes", "miercoles", "sabado" -> próxima ocurrencia (incluye hoy).
  const weekdayMatch = norm.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (weekdayMatch) {
    const targetWeekday = WEEKDAY_NAMES[weekdayMatch[1]];
    const diff = (targetWeekday - today.weekday + 7) % 7;
    return today.plus({ days: diff }).toFormat("yyyy-MM-dd");
  }

  // 6) Numérico: dd/mm, dd-mm, dd/mm/aaaa, dd-mm-aaaa (convención AR: día primero).
  const numericMatch = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (numericMatch) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]);
    let year = numericMatch[3] ? Number(numericMatch[3]) : today.year;
    if (year < 100) year += 2000;
    let candidate = DateTime.fromObject({ year, month, day }, { zone: timezone });
    if (isValidDay(candidate)) {
      // Si no vino año explícito y la fecha ya pasó este año, asumimos el año próximo.
      if (!numericMatch[3] && candidate < today) {
        candidate = DateTime.fromObject({ year: year + 1, month, day }, { zone: timezone });
      }
      if (isValidDay(candidate)) return candidate.toFormat("yyyy-MM-dd");
    }
  }

  return null;
}

/**
 * Reconoce un horario en lenguaje natural: "16", "16hs", "16:00", "16.30", "4 de la tarde".
 * Devuelve el horario en formato "HH:mm" o `null` si no se pudo interpretar.
 */
export function parseNaturalTime(text: string): string | null {
  const norm = normalizeText(text);

  // "16:00" o "16.30"
  const withMinutes = norm.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (withMinutes) {
    const hour = Number(withMinutes[1]);
    return `${String(hour).padStart(2, "0")}:${withMinutes[2]}`;
  }

  // "4 de la tarde" / "4 de la noche" / "4pm"
  const withPeriod = norm.match(/\b(\d{1,2})\s*(?:hs?)?\s*(?:de la tarde|de la noche|pm)\b/);
  if (withPeriod) {
    let hour = Number(withPeriod[1]);
    if (hour < 12) hour += 12;
    if (hour === 24) hour = 12;
    if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, "0")}:00`;
  }
  const withMorningPeriod = norm.match(/\b(\d{1,2})\s*(?:hs?)?\s*(?:de la manana|am)\b/);
  if (withMorningPeriod) {
    const hour = Number(withMorningPeriod[1]) % 12;
    return `${String(hour).padStart(2, "0")}:00`;
  }

  // "16hs" / "16 hs" / "16h"
  const withHs = norm.match(/\b([01]?\d|2[0-3])\s*h(?:s)?\b/);
  if (withHs) {
    const hour = Number(withHs[1]);
    return `${String(hour).padStart(2, "0")}:00`;
  }

  // Número suelto: sólo si el mensaje entero es esa hora, para no capturar números al azar
  // dentro de una frase más larga (por ejemplo "quiero 2 turnos").
  const bare = norm.match(/^([01]?\d|2[0-3])$/);
  if (bare) {
    const hour = Number(bare[1]);
    return `${String(hour).padStart(2, "0")}:00`;
  }

  return null;
}

/** Nombre del día de la semana en español, con tilde, en minúscula ("miércoles"). */
export function weekdayLabel(dateIso: string, timezone: string): string {
  const day = DateTime.fromISO(dateIso, { zone: timezone });
  return WEEKDAY_LABELS[day.weekday - 1];
}

/**
 * Describe una fecha de forma legible y cálida en relación a "hoy": "hoy", "mañana sábado 12/07",
 * "pasado mañana domingo 13/07", o "el lunes 14/07" para el resto de los casos.
 */
export function describeDate(dateIso: string, timezone: string, now: DateTime = DateTime.now().setZone(timezone)): string {
  const today = now.setZone(timezone).startOf("day");
  const day = DateTime.fromISO(dateIso, { zone: timezone }).startOf("day");
  const diffDays = Math.round(day.diff(today, "days").days);
  const dayMonth = day.toFormat("dd/LL");
  const label = weekdayLabel(dateIso, timezone);

  if (diffDays === 0) return `hoy ${label} ${dayMonth}`;
  if (diffDays === 1) return `mañana ${label} ${dayMonth}`;
  if (diffDays === 2) return `pasado mañana ${label} ${dayMonth}`;
  return `el ${label} ${dayMonth}`;
}

/** Formatea una lista de horarios como texto natural: "09:00, 10:00 u 11:00". */
export function joinTimes(times: string[]): string {
  if (times.length === 0) return "";
  if (times.length === 1) return times[0];
  const last = times[times.length - 1];
  const lastHour = Number(last.slice(0, 2));
  // "y" pasa a "u" delante de un sonido "o": las 8 (ocho) y las 11 (once) en español.
  const conjunction = lastHour === 8 || lastHour === 11 ? "u" : "y";
  return `${times.slice(0, -1).join(", ")} ${conjunction} ${last}`;
}
