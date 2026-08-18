import { randomUUID } from "node:crypto";
import "./env";
import { getPrisma } from "../../src/lib/prisma";
import { TEST_SCHEMA } from "./test-db-url";

export const prisma = getPrisma();

const TABLES = [
  "AppointmentActivity",
  "ScheduledMessage",
  "Reminder",
  "Quote",
  "Prescription",
  "MedicalRecord",
  "WhatsappMessage",
  "WhatsappConversation",
  "WebhookEvent",
  "Appointment",
  "Pet",
  "Client",
  "ClinicMember",
  "User",
  "Clinic",
] as const;

/**
 * Vacía todas las tablas del schema `vet_test` entre tests. Nunca corre contra `public`: si el
 * search_path de la conexión no es exactamente `vet_test`, aborta en lugar de arriesgarse.
 */
export async function resetDatabase() {
  const [{ search_path: searchPath }] = await prisma.$queryRawUnsafe<{ search_path: string }[]>("SHOW search_path");
  if (searchPath !== `"${TEST_SCHEMA}"`) {
    throw new Error(`Abortado: search_path inesperado (${searchPath}). Se esperaba "${TEST_SCHEMA}".`);
  }
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

const DEFAULT_OPENING_HOURS = {
  monday: ["09:00", "18:00"],
  tuesday: ["09:00", "18:00"],
  wednesday: ["09:00", "18:00"],
  thursday: ["09:00", "18:00"],
  friday: ["09:00", "18:00"],
  saturday: ["09:00", "18:00"],
  sunday: ["09:00", "18:00"],
};

export async function createTestClinic(overrides: Partial<{ name: string; timezone: string; defaultAppointmentDuration: number; openingHours: unknown }> = {}) {
  return prisma.clinic.create({
    data: {
      name: overrides.name ?? "Clínica de prueba",
      timezone: overrides.timezone ?? "America/Argentina/Buenos_Aires",
      defaultAppointmentDuration: overrides.defaultAppointmentDuration ?? 30,
      openingHours: (overrides.openingHours ?? DEFAULT_OPENING_HOURS) as never,
    },
  });
}

export async function createTestVet(clinicId: string, name = "Dra. Test") {
  const user = await prisma.user.create({ data: { name, email: `${randomUUID()}@test.local` } });
  await prisma.clinicMember.create({ data: { clinicId, userId: user.id, role: "VETERINARIAN", active: true } });
  return user;
}

export async function createTestClient(clinicId: string, overrides: Partial<{ name: string; phone: string; remindersEnabled: boolean }> = {}) {
  return prisma.client.create({
    data: {
      clinicId,
      name: overrides.name ?? "Cliente de prueba",
      phone: overrides.phone ?? `54911${Math.floor(Math.random() * 1e8)}`,
      remindersEnabled: overrides.remindersEnabled ?? true,
    },
  });
}

export async function createTestPet(clinicId: string, clientId: string, overrides: Partial<{ name: string; species: string }> = {}) {
  return prisma.pet.create({
    data: {
      clinicId,
      clientId,
      name: overrides.name ?? "Firulais",
      species: overrides.species ?? "Perro",
    },
  });
}
