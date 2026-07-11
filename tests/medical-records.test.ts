import { beforeEach, describe, expect, it } from "vitest";
import { createMedicalRecord } from "../src/lib/services/medical-records";
import { createTestClient, createTestClinic, createTestPet, createTestVet, resetDatabase, prisma } from "./setup/db";

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function setupClinic(remindersEnabled = true) {
  const clinic = await createTestClinic();
  const vet = await createTestVet(clinic.id);
  const client = await createTestClient(clinic.id, { remindersEnabled });
  const pet = await createTestPet(clinic.id, client.id);
  return { clinic, vet, client, pet };
}

describe("medical-records: recordatorios de control", () => {
  beforeEach(resetDatabase);

  it("crea recordatorios CONTROL_DUE a 7 y 1 día antes cuando hay nextDueDate y remindersEnabled=true", async () => {
    const { clinic, vet, pet } = await setupClinic(true);
    const nextDueDate = daysFromNow(30);

    const record = await createMedicalRecord({ clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "VACCINE", reason: "Vacunación", nextDueDate });

    const reminders = await prisma.reminder.findMany({ where: { medicalRecordId: record.id }, orderBy: { scheduledAt: "asc" } });
    expect(reminders).toHaveLength(2);
    expect(reminders.map((r) => r.deduplicationKey).sort()).toEqual([`control:${record.id}:1d`, `control:${record.id}:7d`].sort());
    expect(reminders.every((r) => r.status === "PENDING" && r.type === "CONTROL_DUE")).toBe(true);
  });

  it("no crea recordatorios si el registro no tiene nextDueDate", async () => {
    const { clinic, vet, pet } = await setupClinic(true);
    const record = await createMedicalRecord({ clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "CONSULTATION", reason: "Consulta general" });

    const reminders = await prisma.reminder.findMany({ where: { medicalRecordId: record.id } });
    expect(reminders).toHaveLength(0);
  });

  it("no crea recordatorios si el cliente tiene remindersEnabled=false", async () => {
    const { clinic, vet, pet } = await setupClinic(false);
    const record = await createMedicalRecord({ clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "VACCINE", reason: "Vacunación", nextDueDate: daysFromNow(30) });

    const reminders = await prisma.reminder.findMany({ where: { medicalRecordId: record.id } });
    expect(reminders).toHaveLength(0);
  });

  it("omite los recordatorios que ya caerían en el pasado", async () => {
    const { clinic, vet, pet } = await setupClinic(true);
    // nextDueDate en 3 días: el aviso de "7 días antes" ya sería pasado y se omite.
    const record = await createMedicalRecord({ clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "CONTROL", reason: "Control", nextDueDate: daysFromNow(3) });

    const reminders = await prisma.reminder.findMany({ where: { medicalRecordId: record.id } });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].deduplicationKey).toBe(`control:${record.id}:1d`);
  });

  it("rechaza un nextDueDate anterior o igual a la fecha de atención", async () => {
    const { clinic, vet, pet } = await setupClinic(true);
    await expect(
      createMedicalRecord({ clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "CONTROL", reason: "Control", nextDueDate: daysFromNow(-1) })
    ).rejects.toThrow("INVALID_NEXT_DUE_DATE");
  });
});
