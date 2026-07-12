/**
 * Rate limiting simple en memoria (ventana fija) para endpoints internos/públicos sensibles.
 *
 * Limitación conocida y aceptada para el MVP: el estado vive en memoria del proceso, así que en
 * una instancia con múltiples réplicas cada una lleva su propio conteo (el límite real termina
 * siendo `limit * cantidad de réplicas`). Hoy corre una sola instancia de la app, así que alcanza.
 * Si se escala a múltiples instancias, esto debería migrar a un store compartido (ej. Redis).
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

// Poda ocasional para no acumular buckets vencidos indefinidamente en memoria.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60_000;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

/**
 * Ventana fija de `windowMs` con máximo `limit` requests por `key`. `key` debería combinar
 * IP + ruta para que un cliente ruidoso en un endpoint no consuma el cupo de otro.
 */
export function checkRateLimit(key: string, limit = 60, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: windowMs - (now - bucket.windowStart) };
  }

  bucket.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/** Extrae una IP razonable de los headers habituales detrás de un proxy (Railway/Vercel). */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Solo para tests: limpia todos los buckets acumulados. */
export function resetRateLimitState() {
  buckets.clear();
  lastSweep = Date.now();
}
