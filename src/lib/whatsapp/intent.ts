const HUMAN_PATTERNS = [
  /\b(humano|persona|recepci[oó]n|veterinaria|reclamo|queja)\b/i,
  /\b(urgente|urgencia|emergencia|sangra|convulsi[oó]n|no respira)\b/i,
  /\b(diagn[oó]stico|medicamento|dosis|remedio|s[ií]ntoma|vomita|diarrea|dolor)\b/i,
];

export function requiresHuman(text: string) {
  return HUMAN_PATTERNS.some((pattern) => pattern.test(text));
}

export function isBookingIntent(text: string) {
  return /\b(turno|reservar|reserva|cita)\b/i.test(text);
}

export function isConfirmIntent(text: string) {
  return /^\s*(confirmar|confirmo|si|sí)\s*$/i.test(text);
}

export function isCancelIntent(text: string) {
  return /\b(cancelar|cancelo)\b/i.test(text);
}

export const MENU =
  "Hola 👋 Soy el asistente de la veterinaria. Puedo ayudarte con:\n\n1. Reservar turno\n2. Confirmar turno\n3. Cambiar horario\n4. Cancelar turno\n5. Hablar con la veterinaria\n\nRespondé con una opción.";
