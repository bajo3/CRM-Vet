import { DateTime } from "luxon";

/** Formatea una fecha/hora en español, en la zona horaria de la clínica. Ej: "viernes 10 de julio, 14:30". */
export function formatDateTime(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date).setZone(timezone).setLocale("es").toFormat("cccc d 'de' LLLL, HH:mm");
}

/** Formatea solo la fecha en español, en la zona horaria de la clínica. Ej: "10 de julio de 2026". */
export function formatDate(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date).setZone(timezone).setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");
}

/** Formatea solo la fecha, corta. Ej: "10/07/2026". */
export function formatDateShort(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date).setZone(timezone).setLocale("es").toFormat("dd/LL/yyyy");
}

/** Formatea solo la hora. Ej: "14:30". */
export function formatTime(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date).setZone(timezone).toFormat("HH:mm");
}

/** Días de calendario entre ahora y `date` en la zona horaria de la clínica (puede ser negativo si ya pasó). Redondea al día calendario, no a 24hs exactas: "mañana a las 23:59" cuenta como 1, no como 0. */
export function daysUntil(date: Date, timezone: string): number {
  const now = DateTime.now().setZone(timezone).startOf("day");
  const target = DateTime.fromJSDate(date).setZone(timezone).startOf("day");
  return Math.round(target.diff(now, "days").days);
}

/** Texto corto en español para `daysUntil`: "hoy", "mañana", "en 3 días". */
export function daysUntilLabel(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/** Capitaliza la primera letra (para encabezados de fecha en español, ej "Viernes 10 de julio"). */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Calcula una edad legible en español a partir de la fecha de nacimiento. */
export function ageFromBirthDate(birthDate: Date, timezone: string): string {
  const now = DateTime.now().setZone(timezone);
  const born = DateTime.fromJSDate(birthDate).setZone(timezone);
  const diff = now.diff(born, ["years", "months"]);
  const years = Math.floor(diff.years);
  const months = Math.floor(diff.months);
  if (years <= 0 && months <= 0) return "Menos de 1 mes";
  if (years <= 0) return `${months} ${months === 1 ? "mes" : "meses"}`;
  if (months <= 0) return `${years} ${years === 1 ? "año" : "años"}`;
  return `${years} ${years === 1 ? "año" : "años"} y ${months} ${months === 1 ? "mes" : "meses"}`;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Dueño/a",
  ADMIN: "Administrador/a",
  VETERINARIAN: "Veterinario/a",
  RECEPTIONIST: "Recepción",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

const APPOINTMENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Confirmado", className: "bg-emerald-100 text-emerald-800" },
  ATTENDED: { label: "Atendido", className: "bg-blue-100 text-blue-800" },
  CANCELLED: { label: "Cancelado", className: "bg-slate-200 text-slate-600 line-through" },
  NO_SHOW: { label: "Ausente", className: "bg-rose-100 text-rose-800" },
};

export function appointmentStatusBadge(status: string) {
  return APPOINTMENT_STATUS_LABELS[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
}

const MEDICAL_RECORD_TYPE_LABELS: Record<string, string> = {
  CONSULTATION: "Consulta",
  VACCINE: "Vacuna",
  TREATMENT: "Tratamiento",
  CONTROL: "Control",
  OTHER: "Otro",
};

export function medicalRecordTypeLabel(type: string): string {
  return MEDICAL_RECORD_TYPE_LABELS[type] ?? type;
}

const REMINDER_TYPE_LABELS: Record<string, string> = {
  CONTROL_DUE: "Control pendiente",
  APPOINTMENT_REMINDER: "Recordatorio de turno",
};

export function reminderTypeLabel(type: string): string {
  return REMINDER_TYPE_LABELS[type] ?? type;
}

const REMINDER_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Programado", className: "bg-amber-100 text-amber-800" },
  SENT: { label: "Enviado", className: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Cancelado", className: "bg-slate-200 text-slate-600" },
  FAILED: { label: "Falló", className: "bg-rose-100 text-rose-800" },
};

export function reminderStatusBadge(status: string) {
  return REMINDER_STATUS_BADGES[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
}

const SCHEDULED_MESSAGE_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Programado", className: "bg-amber-100 text-amber-800" },
  SENT: { label: "Enviado", className: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Cancelado", className: "bg-slate-200 text-slate-600" },
  FAILED: { label: "Falló", className: "bg-rose-100 text-rose-800" },
};

export function scheduledMessageStatusBadge(status: string) {
  return SCHEDULED_MESSAGE_STATUS_BADGES[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
}

const APPOINTMENT_STATUS_TEXT: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  ATTENDED: "Atendido",
  CANCELLED: "Cancelado",
  NO_SHOW: "Ausente",
};

/** Describe en español una entrada de AppointmentActivity, a partir de su acción y detalles. */
export function describeAppointmentActivity(action: string, details: unknown, timezone: string): string {
  const data = (details ?? {}) as Record<string, unknown>;
  if (action === "CREATED") return "Turno creado.";
  if (action === "RESCHEDULED") {
    const oldStart = data.old && typeof data.old === "object" ? (data.old as { startAt?: string }).startAt : undefined;
    const newStart = data.new && typeof data.new === "object" ? (data.new as { startAt?: string }).startAt : undefined;
    if (oldStart && newStart) {
      return `Reprogramado de ${formatDateTime(new Date(oldStart), timezone)} a ${formatDateTime(new Date(newStart), timezone)}.`;
    }
    return "Turno reprogramado.";
  }
  if (action === "STATUS_CHANGED") {
    const from = typeof data.from === "string" ? APPOINTMENT_STATUS_TEXT[data.from] ?? data.from : "?";
    const to = typeof data.to === "string" ? APPOINTMENT_STATUS_TEXT[data.to] ?? data.to : "?";
    return `Estado cambiado de ${from} a ${to}.`;
  }
  return action;
}
