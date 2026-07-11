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
  return url.toString();
}
