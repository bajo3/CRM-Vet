import { beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { bookOnline, getBookingClinic, getOnlineSlots, OnlineBookingError, ONLINE_BOOKING_MAX_ACTIVE_PER_PHONE } from "../src/lib/services/online-booking";
import { updateAppointmentStatus } from "../src/lib/services/appointments";
import { getClinicReport } from "../src/lib/queries/reports";
import { getVaccinationCard } from "../src/lib/queries/vaccination-card";
import { createTestClient, createTestClinic, createTestPet, createTestVet, prisma, resetDatabase } from "./setup/db";

const TZ = "America/Argentina/Buenos_Aires";

function dateInDays(days: number) {
  return DateTime.now().setZone(TZ).plus({ days }).toISODate()!;
}

async function setupClinic(slug = "clinica-test") {
  const created = await createTestClinic();
  const clinic = await prisma.clinic.update({ where: { id: created.id }, data: { status: "APPROVED", bookingSlug: slug } });
  const vet = await createTestVet(clinic.id, "Dra. Uno");
  return { clinic, vet };
}

const baseInput = { clientName: "Laura Gómez", phone: "11 5555-0101", petName: "Milo", reason: "Vacunación" };

describe("reserva online", () => {
  beforeEach(resetDatabase);

  it("solo encuentra clínicas aprobadas que publicaron ese slug", async () => {
    const { clinic } = await setupClinic("patitas-ab12");
    expect((await getBookingClinic("patitas-ab12"))?.id).toBe(clinic.id);
    expect(await getBookingClinic("otro")).toBeNull();
    await prisma.clinic.update({ where: { id: clinic.id }, data: { status: "REJECTED" } });
    expect(await getBookingClinic("patitas-ab12")).toBeNull();
  });

  it("crea cliente, mascota y turno PENDING de origen ONLINE, y ocupa el horario", async () => {
    const { clinic, vet } = await setupClinic();
    const date = dateInDays(3);
    expect(await getOnlineSlots(clinic, date)).toContain("10:00");

    const appointment = await bookOnline(clinic, { ...baseInput, date, time: "10:00" });
    expect(appointment).toMatchObject({ status: "PENDING", source: "ONLINE", veterinarianId: vet.id });

    const client = await prisma.client.findUniqueOrThrow({ where: { clinicId_phone: { clinicId: clinic.id, phone: "1155550101" } }, include: { pets: true } });
    expect(client.name).toBe("Laura Gómez");
    expect(client.pets.map((pet) => pet.name)).toEqual(["Milo"]);
    expect(await getOnlineSlots(clinic, date)).not.toContain("10:00");
  });

  it("reutiliza cliente y mascota existentes sin pisar sus datos", async () => {
    const { clinic } = await setupClinic();
    const client = await createTestClient(clinic.id, { name: "Nombre original", phone: "1155550101" });
    const pet = await createTestPet(clinic.id, client.id, { name: "Milo", species: "Gato" });

    const appointment = await bookOnline(clinic, { ...baseInput, petName: "milo", date: dateInDays(2), time: "11:00" });
    expect(appointment.petId).toBe(pet.id);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).name).toBe("Nombre original");
    expect(await prisma.pet.count({ where: { clinicId: clinic.id } })).toBe(1);
  });

  it("con dos veterinarios ofrece el horario hasta que ambos están ocupados", async () => {
    const { clinic, vet } = await setupClinic();
    const second = await createTestVet(clinic.id, "Dr. Dos");
    const date = dateInDays(4);

    const first = await bookOnline(clinic, { ...baseInput, date, time: "09:00" });
    expect(await getOnlineSlots(clinic, date)).toContain("09:00");
    const other = await bookOnline(clinic, { ...baseInput, phone: "11 5555-0202", date, time: "09:00" });
    expect(new Set([first.veterinarianId, other.veterinarianId])).toEqual(new Set([vet.id, second.id]));

    expect(await getOnlineSlots(clinic, date)).not.toContain("09:00");
    await expect(bookOnline(clinic, { ...baseInput, phone: "11 5555-0303", date, time: "09:00" })).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("rechaza fechas pasadas o demasiado lejanas y limita los turnos activos por teléfono", async () => {
    const { clinic } = await setupClinic();
    await expect(bookOnline(clinic, { ...baseInput, date: dateInDays(-1), time: "10:00" })).rejects.toBeInstanceOf(OnlineBookingError);
    await expect(bookOnline(clinic, { ...baseInput, date: dateInDays(60), time: "10:00" })).rejects.toMatchObject({ code: "INVALID_DATE" });
    expect(await getOnlineSlots(clinic, dateInDays(60))).toEqual([]);

    for (let i = 0; i < ONLINE_BOOKING_MAX_ACTIVE_PER_PHONE; i++) {
      await bookOnline(clinic, { ...baseInput, date: dateInDays(5), time: `1${i}:00` });
    }
    await expect(bookOnline(clinic, { ...baseInput, date: dateInDays(6), time: "10:00" })).rejects.toMatchObject({ code: "TOO_MANY_ACTIVE" });
  });
});

describe("reportes y libreta de vacunación", () => {
  beforeEach(resetDatabase);

  it("calcula turnos, ausentismo, origen y clientes inactivos solo de la clínica pedida", async () => {
    const { clinic, vet } = await setupClinic();
    const other = await setupClinic("otra");
    await bookOnline(other.clinic, { ...baseInput, date: dateInDays(1), time: "10:00" });

    const client = await createTestClient(clinic.id);
    const pet = await createTestPet(clinic.id, client.id);
    const past = (daysAgo: number, status: "ATTENDED" | "NO_SHOW") => {
      const startAt = DateTime.now().minus({ days: daysAgo }).toJSDate();
      return prisma.appointment.create({
        data: { clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Control", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status, source: "WHATSAPP" },
      });
    };
    await past(3, "ATTENDED");
    await past(4, "ATTENDED");
    await past(5, "ATTENDED");
    await past(6, "NO_SHOW");
    const upcoming = await bookOnline(clinic, { ...baseInput, date: dateInDays(1), time: "10:00" });
    await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: upcoming.id, status: "CANCELLED" });

    // Cliente viejo sin actividad: debe aparecer como inactivo.
    const old = await createTestClient(clinic.id, { name: "Cliente viejo" });
    await prisma.client.update({ where: { id: old.id }, data: { createdAt: DateTime.now().minus({ months: 20 }).toJSDate() } });
    await createTestPet(clinic.id, old.id, { name: "Rocky" });

    const report = await getClinicReport(clinic.id, TZ, 30);
    expect(report).toMatchObject({ attended: 3, noShow: 1, noShowRate: 0.25, bookedByWhatsapp: 4, bookedOnline: 1, inactiveCount: 1 });
    expect(report.inactiveClients.map((row) => row.name)).toEqual(["Cliente viejo"]);
    expect(report.veterinarians).toEqual([{ name: "Dra. Uno", total: 4, attended: 3, noShow: 1 }]);
  });

  it("la libreta trae solo las vacunas de esa mascota y respeta la clínica", async () => {
    const { clinic, vet } = await setupClinic();
    const client = await createTestClient(clinic.id);
    const pet = await createTestPet(clinic.id, client.id);
    await prisma.medicalRecord.createMany({
      data: [
        { clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "VACCINE", reason: "Antirrábica" },
        { clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "CONSULTATION", reason: "Consulta general" },
      ],
    });

    const card = await getVaccinationCard(clinic.id, pet.id);
    expect(card?.medicalRecords.map((record) => record.reason)).toEqual(["Antirrábica"]);
    const other = await setupClinic("otra");
    expect(await getVaccinationCard(other.clinic.id, pet.id)).toBeNull();
  });
});
