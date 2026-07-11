import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { beforeEach, describe, expect, it } from "vitest";
import { processIncomingWhatsapp } from "../src/lib/whatsapp/flow";
import { resetDatabase, prisma } from "./setup/db";

const TZ = "America/Argentina/Buenos_Aires";
// Un solo horario libre por día (09:00-09:30) para poder forzar "sin disponibilidad" reservando ese slot.
const SINGLE_SLOT_HOURS = {
  monday: ["09:00", "09:30"],
  tuesday: ["09:00", "09:30"],
  wednesday: ["09:00", "09:30"],
  thursday: ["09:00", "09:30"],
  friday: ["09:00", "09:30"],
  saturday: ["09:00", "09:30"],
  sunday: ["09:00", "09:30"],
};

async function createWhatsappClinic(overrides: Partial<{ openingHours: unknown }> = {}) {
  return prisma.clinic.create({
    data: {
      name: "Clínica WhatsApp de prueba",
      timezone: TZ,
      defaultAppointmentDuration: 30,
      whatsappSessionKey: `test-${randomUUID()}`,
      openingHours: (overrides.openingHours ?? {
        monday: ["09:00", "18:00"],
        tuesday: ["09:00", "18:00"],
        wednesday: ["09:00", "18:00"],
        thursday: ["09:00", "18:00"],
        friday: ["09:00", "18:00"],
        saturday: ["09:00", "18:00"],
        sunday: ["09:00", "18:00"],
      }) as never,
    },
  });
}

async function createVet(clinicId: string) {
  const user = await prisma.user.create({ data: { name: "Dra. Test", email: `${randomUUID()}@test.local` } });
  await prisma.clinicMember.create({ data: { clinicId, userId: user.id, role: "VETERINARIAN", active: true } });
  return user;
}

function baseEvent(clinicKey: string, overrides: Partial<{ eventId: string; phone: string; text: string }> = {}) {
  return {
    eventId: overrides.eventId ?? randomUUID(),
    clinicKey,
    phone: overrides.phone ?? "5491100000001",
    contactName: "Contacto de prueba",
    text: overrides.text ?? "hola",
    timestamp: new Date().toISOString(),
  };
}

describe("flow de WhatsApp", () => {
  beforeEach(resetDatabase);

  it("un evento duplicado (mismo eventId) no se procesa dos veces", async () => {
    const clinic = await createWhatsappClinic();
    const event = baseEvent(clinic.whatsappSessionKey!, { text: "turno" });

    const first = await processIncomingWhatsapp(event);
    expect(first.duplicate).toBeFalsy();

    const second = await processIncomingWhatsapp(event);
    expect(second.duplicate).toBe(true);

    const inboundMessages = await prisma.whatsappMessage.count({ where: { clinicId: clinic.id, direction: "INBOUND" } });
    expect(inboundMessages).toBe(1);
  });

  it("una consulta médica deriva la conversación a REQUIRES_HUMAN sin ofrecer diagnóstico", async () => {
    const clinic = await createWhatsappClinic();
    const event = baseEvent(clinic.whatsappSessionKey!, { text: "mi perro vomita mucho desde ayer" });

    const response = await processIncomingWhatsapp(event);
    expect(response.reply).toMatch(/derivar/i);

    const conversation = await prisma.whatsappConversation.findFirstOrThrow({ where: { clinicId: clinic.id } });
    expect(conversation.status).toBe("REQUIRES_HUMAN");
  });

  it("una urgencia veterinaria real deriva de inmediato y no da indicación médica", async () => {
    const clinic = await createWhatsappClinic();
    const phone = "5491100000099";
    const event = baseEvent(clinic.whatsappSessionKey!, { phone, text: "mi perro se comió veneno, ayuda" });

    const response = await processIncomingWhatsapp(event);
    expect(response.reply).toMatch(/urgencia/i);
    expect(response.reply).toMatch(/clínica|guardia/i);
    expect(response.reply).not.toMatch(/dosis|mililitros|dale de tomar/i);

    const conversation = await prisma.whatsappConversation.findFirstOrThrow({ where: { clinicId: clinic.id } });
    expect(conversation.status).toBe("REQUIRES_HUMAN");
  });

  it("reserva completa con lenguaje natural: mascota única auto-seleccionada, motivo y horario por número", async () => {
    const clinic = await createWhatsappClinic();
    const vet = await createVet(clinic.id);
    const phone = "5491100000002";
    const client = await prisma.client.create({ data: { clinicId: clinic.id, name: "Cliente Natural", phone } });
    const pet = await prisma.pet.create({ data: { clinicId: clinic.id, clientId: client.id, name: "Toby", species: "Perro" } });

    // Usamos "pasado mañana" (en vez de "mañana") para que el recordatorio de 24hs antes caiga
    // siempre en el futuro sin importar a qué hora del día corre el test.
    const r1 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "quiero un turno para pasado mañana" }));
    expect(r1.reply).toMatch(/Toby/);
    expect(r1.reply).toMatch(/motivo/i);

    const r2 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "vacuna" }));
    expect(r2.reply).toMatch(/horarios libres|Cuál preferís/i);

    const r3 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "1" }));
    expect(r3.reply).toMatch(/¡Listo!/);
    expect(r3.reply).toMatch(/Toby/);

    const appointment = await prisma.appointment.findFirstOrThrow({ where: { clinicId: clinic.id, petId: pet.id } });
    expect(appointment.veterinarianId).toBe(vet.id);
    expect(appointment.reason).toBe("Vacunación");

    const activity = await prisma.appointmentActivity.findFirst({ where: { appointmentId: appointment.id, action: "CREATED" } });
    expect(activity).not.toBeNull();

    const reminder = await prisma.reminder.findFirst({ where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" } });
    expect(reminder).not.toBeNull();
  });

  it("un día sin disponibilidad ofrece alternativas reales en vez de un callejón sin salida", async () => {
    const clinic = await createWhatsappClinic({ openingHours: SINGLE_SLOT_HOURS });
    const vet = await createVet(clinic.id);

    // Ocupamos el único slot de "mañana" con otro cliente para forzar la búsqueda de alternativas.
    const otherClient = await prisma.client.create({ data: { clinicId: clinic.id, name: "Otro cliente", phone: "5491100000077" } });
    const otherPet = await prisma.pet.create({ data: { clinicId: clinic.id, clientId: otherClient.id, name: "Rex", species: "Perro" } });
    const tomorrow = DateTime.now().setZone(TZ).plus({ days: 1 }).toFormat("yyyy-MM-dd");
    const startAt = DateTime.fromISO(`${tomorrow}T09:00`, { zone: TZ }).toUTC().toJSDate();
    const endAt = DateTime.fromISO(`${tomorrow}T09:30`, { zone: TZ }).toUTC().toJSDate();
    await prisma.appointment.create({
      data: { clinicId: clinic.id, petId: otherPet.id, veterinarianId: vet.id, reason: "Consulta", startAt, endAt, status: "CONFIRMED" },
    });

    const phone = "5491100000003";
    const client = await prisma.client.create({ data: { clinicId: clinic.id, name: "Cliente Alterno", phone } });
    const pet = await prisma.pet.create({ data: { clinicId: clinic.id, clientId: client.id, name: "Milo", species: "Gato" } });

    const r1 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "quiero un turno de control para mi gato mañana" }));
    expect(r1.reply).toMatch(/no tengo lugares|no me quedan lugares/i);
    expect(r1.reply).toMatch(/Te puedo ofrecer/i);

    const conversation = await prisma.whatsappConversation.findFirstOrThrow({ where: { clinicId: clinic.id, phone } });
    const state = conversation.flowState as { offeredSlots?: { date: string; times: string[] }[] };
    expect(state.offeredSlots?.length).toBeGreaterThan(0);

    const r2 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "1" }));
    expect(r2.reply).toMatch(/¡Listo!/);

    const appointment = await prisma.appointment.findFirstOrThrow({ where: { clinicId: clinic.id, petId: pet.id } });
    expect(appointment.reason).toBe("Control");
    expect(appointment.startAt.getTime()).not.toBe(startAt.getTime());
  });

  it("un cliente sin mascotas registradas crea una mascota mínima 'A confirmar'", async () => {
    const clinic = await createWhatsappClinic();
    await createVet(clinic.id);
    const phone = "5491100000004";

    const r1 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "quiero un turno para mañana" }));
    expect(r1.reply).toMatch(/cómo se llama/i);

    const r2 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "Rocky" }));
    expect(r2.reply).toMatch(/Rocky/);

    const client = await prisma.client.findFirstOrThrow({ where: { clinicId: clinic.id, phone } });
    const pet = await prisma.pet.findFirstOrThrow({ where: { clinicId: clinic.id, clientId: client.id } });
    expect(pet.name).toBe("Rocky");
    expect(pet.species).toBe("A confirmar");
    expect(pet.notes).toMatch(/completar datos en la clínica/i);
  });

  it("si el bot no entiende dos mensajes seguidos, deriva a una persona", async () => {
    const clinic = await createWhatsappClinic();
    const phone = "5491100000005";

    const r1 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "asdkjqwoieu zxczx" }));
    expect(r1.reply).toMatch(/Hola/);
    let conversation = await prisma.whatsappConversation.findFirstOrThrow({ where: { clinicId: clinic.id, phone } });
    expect(conversation.status).toBe("AUTOMATED");

    const r2 = await processIncomingWhatsapp(baseEvent(clinic.whatsappSessionKey!, { phone, text: "mnbvcxz poiuytrewq" }));
    expect(r2.reply).toMatch(/derivo|equipo/i);
    conversation = await prisma.whatsappConversation.findFirstOrThrow({ where: { clinicId: clinic.id, phone } });
    expect(conversation.status).toBe("REQUIRES_HUMAN");
  });
});
