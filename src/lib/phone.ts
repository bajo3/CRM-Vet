export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

/**
 * Formato legible de un teléfono argentino guardado como dígitos ("5491160011003" → "+54 9 11 6001-1003",
 * "1155550177" → "11 5555-0177"). Si no reconoce el formato, devuelve el valor tal cual: es solo para
 * mostrar, nunca para guardar ni buscar.
 */
export function formatPhone(value: string): string {
  const digits = normalizePhone(value);
  const local = (rest: string) => (rest.length === 10 ? `${rest.slice(0, 2)} ${rest.slice(2, 6)}-${rest.slice(6)}` : null);
  if (digits.startsWith("549") && digits.length === 13) {
    const formatted = local(digits.slice(3));
    if (formatted) return `+54 9 ${formatted}`;
  }
  if (digits.startsWith("54") && digits.length === 12) {
    const formatted = local(digits.slice(2));
    if (formatted) return `+54 ${formatted}`;
  }
  return local(digits) ?? value;
}
