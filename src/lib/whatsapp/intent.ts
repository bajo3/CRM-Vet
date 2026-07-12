/**
 * Detección de intención en lenguaje natural (es-AR) para el bot de WhatsApp.
 * Todas las funciones son puras (sólo regex/keywords) para poder testearlas sin DB.
 */

// Vocabulario de urgencia veterinaria real: ante cualquiera de estos patrones se deriva
// INMEDIATAMENTE a la veterinaria y jamás se da indicación médica, ni básica.
const URGENT_PATTERNS = [
  /\burgenc/i,
  /\bemergenc/i,
  /\bgrave\b/i,
  /se\s+(me\s+)?muere/i,
  /murien(do|te)/i,
  /sangr(a|e|ando)/i,
  /convulsion/i,
  /convulsiv/i,
  /atropell/i,
  /envenen/i,
  /\bveneno\b/i,
  /intoxic/i,
  /no\s+respira/i,
  /no\s+come\s+hace/i,
  /vomita\s+sangre/i,
  /\baccidente\b/i,
  /quebr(ad[oa]|[oó])/i,
  /fractura/i,
  /desmay/i,
  /temblando/i,
  /\bparto\b/i,
];

// Consultas que ameritan pasar a una persona pero que no son una emergencia inmediata:
// reclamos, pedidos explícitos de hablar con alguien, o preguntas médicas puntuales
// (sobre las que el bot nunca debe opinar).
const NON_URGENT_HUMAN_PATTERNS = [
  /\b(humano|persona|recepci[oó]n|veterinaria|reclamo|queja)\b/i,
  /\b(diagn[oó]stico|medicamento|dosis|remedio|s[ií]ntoma|vomita|diarrea|dolor)\b/i,
];

/** Detecta una urgencia veterinaria real (prioridad máxima: derivar ya, sin consejo médico). */
export function isUrgent(text: string): boolean {
  return URGENT_PATTERNS.some((pattern) => pattern.test(text));
}

/** Detecta cualquier situación (urgente o no) que deba derivarse a una persona. */
export function requiresHuman(text: string): boolean {
  return isUrgent(text) || NON_URGENT_HUMAN_PATTERNS.some((pattern) => pattern.test(text));
}

export function isBookingIntent(text: string): boolean {
  return /\b(turno|reservar|reserva|cita|sacar\s+un?\s+turno|pedir\s+un?\s+turno|agendar|necesito\s+llevar|quiero\s+llevar|llevar\s+a\s+mi)\b/i.test(text);
}

export function isConfirmIntent(text: string): boolean {
  return /^\s*(confirmar|confirmo|confirmado|dale|listo|ok|okay|de\s+una)\s*$/i.test(text) || /^\s*s[ií]\s*$/i.test(text);
}

export function isCancelIntent(text: string): boolean {
  // Cubre conjugaciones habituales: cancelar, cancelo, cancela, cancelame, cancelalo, anular, anulo...
  return /\bcancel\w*\b/i.test(text) || /\banul\w*\b/i.test(text);
}

export function isRescheduleIntent(text: string): boolean {
  return (
    /\b(cambi\w*|reprogram\w*|mover)\b.*\b(turno|horario|cita|fecha)\b/i.test(text) ||
    /\b(turno|horario|cita)\b.*\b(cambi\w*|reprogram\w*|mover)\b/i.test(text) ||
    /puedo\s+cambiar/i.test(text)
  );
}

/**
 * "consultar horarios" / "ver horarios" / "qué horarios tienen": respuesta rápida típica a un
 * recordatorio de control (`CONTROL_DUE`) pidiendo ver la disponibilidad real en vez de derivar.
 */
export function isCheckAvailabilityIntent(text: string): boolean {
  return (
    /\b(consultar|ver|dame|decime|cu[aá]les?\s+son|qu[eé])\b[^.!?\n]*\bhorarios?\b/i.test(text) ||
    /\bhorarios?\b[^.!?\n]*\b(disponibles?|libres?|tienen|ten[eé]s|hay)\b/i.test(text)
  );
}

/** "cuanto antes" / "lo antes posible": el cliente quiere el primer horario disponible, sea cuando sea. */
export function isAsapIntent(text: string): boolean {
  return /\b(cuanto\s+antes|lo\s+antes\s+posible|lo\s+m[aá]s\s+pronto\s+posible|lo\s+m[aá]s\s+rapido\s+posible|apenas\s+se\s+pueda)\b/i.test(text);
}

/** "salir" / "menu": reinicia el flujo desde cero. "cancelar" se maneja aparte por su ambigüedad. */
export function isResetIntent(text: string): boolean {
  return /^\s*(salir|men[uú])\s*$/i.test(text);
}

export function isGreeting(text: string): boolean {
  return /^\s*(hola|buenas|buen\s*d[ií]a|buenas\s*tardes|buenas\s*noches|que\s+tal|ey|hey)\b/i.test(text);
}

/** Extrae el motivo del turno si el cliente ya lo mencionó en la misma frase. */
export function extractReason(text: string): string | null {
  if (/\bvacun/i.test(text)) return "Vacunación";
  if (/\bcontrol\b/i.test(text)) return "Control";
  if (/\bconsulta\b/i.test(text)) return "Consulta";
  return null;
}

/** Saludo inicial cálido con el menú numerado como fallback (item 5: el menú es sólo respaldo). */
export function buildGreeting(clinicName: string): string {
  // El nombre de la clínica a veces ya incluye la palabra "Veterinaria" (p. ej. "Veterinaria Patitas");
  // evitamos duplicarla en el saludo.
  const displayName = /^veterinaria\b/i.test(clinicName.trim()) ? clinicName.trim() : `Veterinaria ${clinicName}`;
  return `Hola 👋 Soy el asistente de ${displayName}. Contame qué necesitás — por ejemplo: "quiero un turno para mañana" — o elegí una opción:\n\n1. Reservar turno\n2. Confirmar turno\n3. Cambiar turno\n4. Cancelar turno\n5. Hablar con la veterinaria`;
}
