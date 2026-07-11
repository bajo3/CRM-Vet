import { beforeEach, describe, expect, it } from "vitest";
import { createAppointment, rescheduleAppointment, updateAppointmentStatus } from "../src/lib/services/appointments";
import { createMedicalRecord } from "../src/lib/services/medical-records";
import { AppointmentConflictError } from "../src/lib/services/errors";
import { createTestClient, createTestClinic, createTestPet, createTestVet, resetDatabase } from "./setup/db";

async function setupClinic() {
  const clinic = await createTestClinic();
  const vet = await createTestVet(clinic.id, "Dra. Test");
  const client = await createTestClient(clinic.id);
  const pet = await createTestPet(clinic.id, client.id, { name: "Firulais" });
  return { clinic, vet, client, pet };
}

function slot(daysFromNow: number, hour: number) {
  const startAt = new Date();
  startAt.setDate(startAt.getDate() + daysFromNow);
  startAt.setHours(hour, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + 30 * 60_000);
  return { startAt, endAt };
}

describe("appointments: solapamiento y concurrencia", () => {
  beforeEach(resetDatabase);

  it("bloquea un turno solapado con uno PENDING existente", async () => {
    const { clinic, vet, pet } = await setupClinic();
    const { startAt, endAt } = slot(5, 10);
    await createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Consulta", startAt, endAt });

    const overlapping = slot(5, 10);
    overlapping.startAt.setMinutes(15);
    overlapping.endAt.setMinutes(45);

    await expect(
      createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Otra consulta", startAt: overlapping.startAt, endAt: overlapping.endAt })
    ).rejects.toBeInstanceOf(AppointmentConflictError);
  });

  it("bloquea un turno solapado con uno CONFIRMED", async () => {
    const { clinic, vet, pet } = await setupClinic();
    const { startAt, endAt } = slot(6, 11);
    const appt = await createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Consulta", startAt, endAt });
    await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: appt.id, status: "CONFIRMED" });

    await expect(
      createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Otra", startAt, endAt })
    ).rejects.toBeInstanceOf(AppointmentConflictError);
  });

  it("un turno cancelado libera el horario", async () => {
    const { clinic, vet, pet } = await setupClinic();
    const { startAt, endAt } = slot(7, 9);
    const appt = await createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Consulta", startAt, endAt });
    await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: appt.id, status: "CANCELLED" });

    const second = await createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Nueva consulta", startAt, endAt });
    expect(second.id).not.toBe(appt.id);
  });

  it("dos reservas concurrentes al mismo horario: exactamente una gana", async () => {
    const { clinic, vet, pet } = await setupClinic();
    const { startAt, endAt } = slot(8, 14);

    const results = await Promise.allSettled([
      createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "A", startAt, endAt }),
      createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "B", startAt, endAt }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppointmentConflictError);
  });

  it("reprogramar revalida disponibilidad contra otros turnos", async () => {
    const { clinic, vet, pet, client } = await setupClinic();
    const pet2 = await createTestPet(clinic.id, client.id, { name: "Michi", species: "Gato" });

    const slotA = slot(9, 10);
    const slotB = slot(9, 11);
    const apptA = await createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "A", startAt: slotA.startAt, endAt: slotA.endAt });
    await createAppointment({ clinicId: clinic.id, petId: pet2.id, veterinarianId: vet.id, reason: "B", startAt: slotB.startAt, endAt: slotB.endAt });

    await expect(
      rescheduleAppointment({ clinicId: clinic.id, appointmentId: apptA.id, startAt: slotB.startAt, endAt: slotB.endAt })
    ).rejects.toBeInstanceOf(AppointmentConflictError);

    const freeSlot = slot(9, 15);
    const rescheduled = await rescheduleAppointment({ clinicId: clinic.id, appointmentId: apptA.id, startAt: freeSlot.startAt, endAt: freeSlot.endAt });
    expect(rescheduled.startAt.getTime()).toBe(freeSlot.startAt.getTime());

    const activities = await (await import("../src/lib/prisma")).getPrisma().appointmentActivity.findMany({ where: { appointmentId: apptA.id } });
    expect(activities.some((a) => a.action === "RESCHEDULED")).toBe(true);
  });

  it("crear un turno cancela los recordatorios CONTROL_DUE pendientes de la mascota", async () => {
    const { clinic, vet, pet } = await setupClinic();
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 10);
    const record = await createMedicalRecord({ clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "VACCINE", reason: "Vacuna", nextDueDate });

    const prisma = (await import("../src/lib/prisma")).getPrisma();
    const pendingBefore = await prisma.reminder.count({ where: { medicalRecordId: record.id, status: "PENDING" } });
    expect(pendingBefore).toBe(2);

    const { startAt, endAt } = slot(3, 9);
    await createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Control", startAt, endAt });

    const remaining = await prisma.reminder.findMany({ where: { medicalRecordId: record.id } });
    expect(remaining.every((r) => r.status === "CANCELLED")).toBe(true);
  });
});

describe("appointments: aislamiento multiempresa", () => {
  beforeEach(resetDatabase);

  it("una clínica no puede crear turnos con mascotas o veterinarios de otra clínica", async () => {
    const clinicA = await setupClinic();
    const clinicB = await setupClinic();
    const { startAt, endAt } = slot(4, 10);

    await expect(
      createAppointment({ clinicId: clinicB.clinic.id, petId: clinicA.pet.id, veterinarianId: clinicB.vet.id, reason: "Intento cruzado", startAt, endAt })
    ).rejects.toThrow("PET_NOT_FOUND");

    await expect(
      createAppointment({ clinicId: clinicA.clinic.id, petId: clinicA.pet.id, veterinarianId: clinicB.vet.id, reason: "Intento cruzado", startAt, endAt })
    ).rejects.toThrow("VETERINARIAN_NOT_FOUND");
  });

  it("los turnos de una clínica no aparecen en las consultas de otra", async () => {
    const clinicA = await setupClinic();
    const clinicB = await setupClinic();
    const { startAt, endAt } = slot(4, 12);
    await createAppointment({ clinicId: clinicA.clinic.id, petId: clinicA.pet.id, veterinarianId: clinicA.vet.id, reason: "Consulta", startAt, endAt });

    const prisma = (await import("../src/lib/prisma")).getPrisma();
    const countB = await prisma.appointment.count({ where: { clinicId: clinicB.clinic.id } });
    expect(countB).toBe(0);
  });
});
