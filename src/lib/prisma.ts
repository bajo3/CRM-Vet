import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Devuelve la connection string a usar por el motor de Prisma, sin nunca loguearla ni exponerla.
 *
 * El pooler de Supabase corre en "session mode" con `pool_size: 15` para todo el proyecto
 * (compartido entre `next dev`, `next start`, los workers de WhatsApp/recordatorios y los tests).
 * Sin este tope, cada `PrismaClient` abre por defecto hasta `num_cpus * 2 + 1` conexiones propias
 * (en esta máquina, con 32 núcleos, eso son ~65 conexiones para un solo proceso), lo que agota el
 * pool compartido con apenas 1-2 procesos corriendo a la vez y produce errores intermitentes
 * "FATAL: max clients reached" en cualquier página. Achicamos el límite por proceso a un valor
 * chico y agregamos un pool_timeout razonable para no colgar la app esperando una conexión libre.
 */
function resolveDatasourceUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Falta DATABASE_URL en las variables de entorno.");
  const url = new URL(base);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "4");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "15");
  return url.toString();
}

/**
 * Flag de debug opcional (apagado por defecto, sin ruido en producción ni en desarrollo normal):
 * con `DEBUG_PRISMA_QUERIES=1` en el entorno, cada query se loguea con su duración en ms para
 * poder contar cuántas queries dispara cada ruta durante una medición puntual de performance.
 */
const DEBUG_QUERIES = process.env.DEBUG_PRISMA_QUERIES === "1";

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasourceUrl: resolveDatasourceUrl(),
      ...(DEBUG_QUERIES ? { log: [{ emit: "stdout", level: "query" }] } : {}),
    });
  }
  return globalForPrisma.prisma;
}

