/**
 * Construye la URL de conexión usada por los tests: misma base de datos Supabase que la app,
 * pero apuntando siempre al schema `vet_test` (nunca `public`), vía el parámetro `schema` de
 * la connection string de Postgres que Prisma traduce en `search_path`.
 */
export const TEST_SCHEMA = "vet_test";

export function buildTestDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Falta DATABASE_URL para configurar la base de tests");
  const url = new URL(base);
  url.searchParams.set("schema", TEST_SCHEMA);
  // Ídem src/lib/prisma.ts: el pooler comparte pool_size 15 entre todos los procesos (dev, start,
  // workers y tests). Achicamos el límite acá también para que `prisma db push` y los tests no
  // acaparen conexiones que dejan sin lugar al resto de los procesos.
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "4");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "15");
  return url.toString();
}
