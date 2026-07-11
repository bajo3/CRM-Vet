import "dotenv/config";
import { execSync } from "node:child_process";
import { buildTestDatabaseUrl } from "./test-db-url";

/**
 * Corre una única vez antes de toda la suite: sincroniza la estructura de `prisma/schema.prisma`
 * contra el schema `vet_test` (separado de `public`) mediante `prisma db push`. No usa
 * migraciones (que incluyen DDL manual como la extensión btree_gist y la exclusion constraint,
 * pensada para `public`); alcanza con que las tablas existan para probar los servicios.
 */
export default async function globalSetup() {
  const testDatabaseUrl = buildTestDatabaseUrl();
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}
