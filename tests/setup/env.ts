import "dotenv/config";
import { buildTestDatabaseUrl } from "./test-db-url";

// Se ejecuta antes de cada archivo de test: fuerza que cualquier PrismaClient creado
// después de este punto (getPrisma() los crea de forma perezosa) apunte al schema `vet_test`.
process.env.DATABASE_URL = buildTestDatabaseUrl();
