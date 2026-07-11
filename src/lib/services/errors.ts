/** Error tipado y reutilizable para conflictos de disponibilidad de turnos. */
export class AppointmentConflictError extends Error {
  constructor(message = "El horario elegido ya no está disponible.") {
    super(message);
    this.name = "AppointmentConflictError";
  }
}

/** Postgres: violación de la constraint de exclusión anti-solapamiento. */
export const POSTGRES_EXCLUSION_VIOLATION = "23P01";

/** Prisma: fallo de la transacción Serializable por conflicto de escritura. */
export const PRISMA_SERIALIZATION_FAILURE = "P2034";

function pgCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  // Prisma envuelve el error nativo de node-postgres en `meta` cuando no reconoce el código.
  if (error && typeof error === "object" && "meta" in error) {
    const meta = (error as { meta?: { code?: unknown; message?: unknown } }).meta;
    if (meta && typeof meta.code === "string") return meta.code;
    if (meta && typeof meta.message === "string") {
      const match = meta.message.match(/SQLSTATE\[?(\w{5})\]?/i) || meta.message.match(/\b(\d{5})\b/);
      if (match) return match[1];
    }
  }
  return undefined;
}

/** True si el error representa un conflicto de disponibilidad (exclusion constraint o fallo de serialización). */
export function isAvailabilityConflict(error: unknown): boolean {
  if (error instanceof AppointmentConflictError) return true;
  const code = pgCode(error);
  if (code === PRISMA_SERIALIZATION_FAILURE) return true;
  if (code === POSTGRES_EXCLUSION_VIOLATION) return true;
  if (error instanceof Error && /23P01/.test(error.message)) return true;
  return false;
}
