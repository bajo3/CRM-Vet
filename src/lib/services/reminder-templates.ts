/**
 * Textos por defecto y helper de sustitución de placeholders para los recordatorios automáticos
 * por WhatsApp. Módulo puro (sin `getPrisma`, sin nada server-only) a propósito: lo usa tanto
 * `reminders.ts` (server, para armar el mensaje real) como el formulario de Configuración (client,
 * para la vista previa en vivo mientras la clínica edita su texto).
 */

export type ReminderTemplateKind = "CONTROL_DUE" | "APPOINTMENT_REMINDER";

export const DEFAULT_APPOINTMENT_REMINDER_TEMPLATE =
  "Hola {cliente}! Te recordamos que {mascota} tiene turno el {fecha} en {clinica}. Si necesitás cancelar o reprogramar, respondé este mensaje.";

export const DEFAULT_CONTROL_REMINDER_TEMPLATE =
  "Hola {cliente}! Te recordamos que {mascota} tiene un control pendiente ({motivo}) para el {fecha} en {clinica}. Escribinos para coordinar un turno.";

/** Placeholders disponibles por tipo de recordatorio, con una explicación breve para la UI. */
export const REMINDER_TEMPLATE_PLACEHOLDERS: Record<ReminderTemplateKind, Array<{ key: string; label: string }>> = {
  APPOINTMENT_REMINDER: [
    { key: "cliente", label: "Nombre del cliente" },
    { key: "mascota", label: "Nombre de la mascota" },
    { key: "fecha", label: "Fecha y hora del turno" },
    { key: "clinica", label: "Nombre de tu clínica" },
  ],
  CONTROL_DUE: [
    { key: "cliente", label: "Nombre del cliente" },
    { key: "mascota", label: "Nombre de la mascota" },
    { key: "fecha", label: "Fecha del control" },
    { key: "clinica", label: "Nombre de tu clínica" },
    { key: "dias", label: "Días que faltan para el control" },
    { key: "motivo", label: "Motivo del control (ej. vacuna, cirugía)" },
  ],
};

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * Reemplaza `{clave}` por su valor en `values`. Los placeholders que no están en `values` (typo de
 * la clínica, o uno que no existe) se dejan tal cual, sin romper ni tirar error.
 */
export function renderReminderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

/** Datos de ejemplo para la vista previa en Configuración; `clinica` se completa con el nombre real. */
export function getReminderTemplateSampleValues(kind: ReminderTemplateKind, clinicName: string): Record<string, string> {
  const base = { cliente: "María", mascota: "Firulais", fecha: "15/08/2026", clinica: clinicName };
  if (kind === "CONTROL_DUE") {
    return { ...base, dias: "7", motivo: "vacuna antirrábica" };
  }
  return base;
}
