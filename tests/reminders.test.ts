import { beforeEach, describe, expect, it } from "vitest";
import { OutboxWhatsAppProvider, type WhatsAppProvider } from "../src/lib/services/whatsapp-provider";
import { processDueReminders } from "../src/lib/services/reminders";
import { renderReminderTemplate } from "../src/lib/services/reminder-templates";
import { createTestClient, createTestClinic, createTestPet, createTestVet, resetDatabase, prisma } from "./setup/db";

class CountingProvider implements WhatsAppProvider {
  calls = 0;
  async sendText(): Promise<{ externalMessageId: string }> {
    this.calls++;
    return { externalMessageId: `fake-${this.calls}` };
  }
}

class FailingProvider implements WhatsAppProvider {
  calls = 0;
  async sendText(): Promise<{ externalMessageId: string }> {
    this.calls++;
    throw new Error("Fallo simulado del proveedor");
  }
}

function pastDate(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function setupClinic() {
  const clinic = await createTestClinic();
  const vet = await createTestVet(clinic.id);
  const client = await createTestClient(clinic.id);
  const pet = await createTestPet(clinic.id, client.id);
  return { clinic, vet, client, pet };
}

async function createDueReminder(clinicId: string, clientId: string, petId: string, overrides: Partial<{ type: "CONTROL_DUE" | "APPOINTMENT_REMINDER"; appointmentId: string | null }> = {}) {
  return prisma.reminder.create({
    data: {
      clinicId,
      clientId,
      petId,
      type: overrides.type ?? "CONTROL_DUE",
      appointmentId: overrides.appointmentId ?? null,
      scheduledAt: pastDate(5),
      deduplicationKey: `test:${clinicId}:${petId}:${Math.random()}`,
    },
  });
}

describe("reminders: envío y reintentos", () => {
  beforeEach(resetDatabase);

  it("envía un recordatorio vencido, lo marca SENT y registra el mensaje saliente", async () => {
    const { clinic, client, pet } = await setupClinic();
    const reminder = await createDueReminder(clinic.id, client.id, pet.id);
    const provider = new CountingProvider();

    const result = await processDueReminders(provider);

    expect(result.sent).toBe(1);
    const updated = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.externalMessageId).toBeTruthy();
    expect(updated.sentAt).toBeTruthy();

    const messages = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messages).toHaveLength(1);
  });

  it("no envía dos veces: correr el proceso dos veces seguidas envía una sola vez", async () => {
    const { clinic, client, pet } = await setupClinic();
    await createDueReminder(clinic.id, client.id, pet.id);
    const provider = new CountingProvider();

    const first = await processDueReminders(provider);
    const second = await processDueReminders(provider);

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(provider.calls).toBe(1);

    const messages = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messages).toHaveLength(1);
  });

  it("un proveedor que siempre falla deja el recordatorio FAILED al tercer intento, sin duplicar mensajes", async () => {
    const { clinic, client, pet } = await setupClinic();
    const reminder = await createDueReminder(clinic.id, client.id, pet.id);
    const provider = new FailingProvider();

    const r1 = await processDueReminders(provider);
    expect(r1.retried).toBe(1);
    let current = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(current.status).toBe("PENDING");
    expect(current.attempts).toBe(1);

    // El recordatorio ya venció originalmente; para que vuelva a ser elegido hay que
    // asegurarse de que scheduledAt siga en el pasado (no cambia entre corridas).
    const r2 = await processDueReminders(provider);
    expect(r2.retried).toBe(1);
    current = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(current.status).toBe("PENDING");
    expect(current.attempts).toBe(2);

    const r3 = await processDueReminders(provider);
    expect(r3.failed).toBe(1);
    current = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(current.status).toBe("FAILED");
    expect(current.attempts).toBe(3);
    expect(current.failedAt).toBeTruthy();

    // Un cuarto intento no debe volver a procesarlo (ya no está PENDING).
    const r4 = await processDueReminders(provider);
    expect(r4.sent + r4.retried + r4.failed).toBe(0);
    expect(provider.calls).toBe(3);

    const messages = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messages).toHaveLength(0);
  });

  it("cancela un CONTROL_DUE sin enviar si la mascota ya tiene un turno futuro agendado", async () => {
    const { clinic, vet, client, pet } = await setupClinic();
    await createDueReminder(clinic.id, client.id, pet.id, { type: "CONTROL_DUE" });
    await prisma.appointment.create({
      data: { clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Control", startAt: futureDate(2), endAt: new Date(futureDate(2).getTime() + 30 * 60_000), status: "PENDING" },
    });

    const provider = new CountingProvider();
    const result = await processDueReminders(provider);

    expect(result.cancelled).toBe(1);
    expect(provider.calls).toBe(0);
  });

  it("OutboxWhatsAppProvider encola el recordatorio como HUMAN_QUEUED y processDueReminders lo marca SENT sin duplicar", async () => {
    const { clinic, client, pet } = await setupClinic();
    const reminder = await createDueReminder(clinic.id, client.id, pet.id);
    const provider = new OutboxWhatsAppProvider();

    const result = await processDueReminders(provider);

    expect(result.sent).toBe(1);
    const updatedReminder = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(updatedReminder.status).toBe("SENT");
    expect(updatedReminder.externalMessageId).toBeTruthy();

    // Un solo WhatsappMessage OUTBOUND: el que crea el propio proveedor (HUMAN_QUEUED, listo para
    // que lo levante el worker de Baileys). `handleReminder` no debe crear uno adicional.
    const messages = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("HUMAN_QUEUED");
    expect(messages[0].id).toBe(updatedReminder.externalMessageId);

    // El mensaje automático no debe activar atención humana ni asignar la conversación a nadie.
    const conversation = await prisma.whatsappConversation.findFirstOrThrow({ where: { clinicId: clinic.id, phone: client.phone } });
    expect(conversation.status).toBe("AUTOMATED");
    expect(conversation.assignedUserId).toBeNull();
    expect(conversation.clientId).toBe(client.id);

    // Correr el proceso de nuevo no debe volver a encolar nada (ya está SENT).
    const second = await processDueReminders(provider);
    expect(second.sent).toBe(0);
    const messagesAfterSecondRun = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messagesAfterSecondRun).toHaveLength(1);
  });

  it("cancela un APPOINTMENT_REMINDER sin enviar si el turno ya no está activo", async () => {
    const { clinic, vet, client, pet } = await setupClinic();
    const appointment = await prisma.appointment.create({
      data: { clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Control", startAt: futureDate(1), endAt: new Date(futureDate(1).getTime() + 30 * 60_000), status: "CANCELLED" },
    });
    await createDueReminder(clinic.id, client.id, pet.id, { type: "APPOINTMENT_REMINDER", appointmentId: appointment.id });

    const provider = new CountingProvider();
    const result = await processDueReminders(provider);

    expect(result.cancelled).toBe(1);
    expect(provider.calls).toBe(0);
  });
});

describe("renderReminderTemplate: sustitución de placeholders", () => {
  it("reemplaza todos los placeholders conocidos", () => {
    const result = renderReminderTemplate("Hola {cliente}, {mascota} tiene control el {fecha} en {clinica} (faltan {dias} días, motivo: {motivo})", {
      cliente: "María",
      mascota: "Firulais",
      fecha: "15/08/2026",
      clinica: "Veterinaria Patitas",
      dias: "7",
      motivo: "vacuna",
    });
    expect(result).toBe("Hola María, Firulais tiene control el 15/08/2026 en Veterinaria Patitas (faltan 7 días, motivo: vacuna)");
  });

  it("deja intacto un placeholder desconocido en vez de romper", () => {
    const result = renderReminderTemplate("Hola {cliente}, tu código es {codigoInexistente}", { cliente: "María" });
    expect(result).toBe("Hola María, tu código es {codigoInexistente}");
  });

  it("no toca el texto si no hay placeholders", () => {
    expect(renderReminderTemplate("Mensaje fijo sin variables", {})).toBe("Mensaje fijo sin variables");
  });
});

describe("reminders: templates personalizados por clínica", () => {
  beforeEach(resetDatabase);

  it("usa el texto por defecto cuando la clínica no tiene template propio (CONTROL_DUE)", async () => {
    const { clinic, client, pet } = await setupClinic();
    await createDueReminder(clinic.id, client.id, pet.id, { type: "CONTROL_DUE" });
    const provider = new CountingProvider();

    await processDueReminders(provider);

    const [message] = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(message.content).toContain("Hola");
    expect(message.content).toContain(client.name);
    expect(message.content).toContain(pet.name);
    expect(message.content).toContain(clinic.name);
    // El texto por defecto siempre incluye "control pendiente" (viene del template default).
    expect(message.content).toContain("control pendiente");
  });

  it("usa el template personalizado de la clínica cuando está configurado (CONTROL_DUE)", async () => {
    const { clinic, client, pet } = await setupClinic();
    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { controlReminderTemplate: "Aviso para {cliente}: {mascota} necesita un control ({motivo}) en {dias} días. Saludos, {clinica}." },
    });
    await createDueReminder(clinic.id, client.id, pet.id, { type: "CONTROL_DUE" });
    const provider = new CountingProvider();

    await processDueReminders(provider);

    const [message] = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(message.content).toBe(`Aviso para ${client.name}: ${pet.name} necesita un control (control) en 0 días. Saludos, ${clinic.name}.`);
  });

  it("usa el template personalizado de la clínica cuando está configurado (APPOINTMENT_REMINDER)", async () => {
    const { clinic, vet, client, pet } = await setupClinic();
    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { appointmentReminderTemplate: "{clinica} te espera {cliente}! Turno de {mascota}: {fecha}." },
    });
    const appointment = await prisma.appointment.create({
      data: { clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Control", startAt: futureDate(1), endAt: new Date(futureDate(1).getTime() + 30 * 60_000), status: "PENDING" },
    });
    await createDueReminder(clinic.id, client.id, pet.id, { type: "APPOINTMENT_REMINDER", appointmentId: appointment.id });
    const provider = new CountingProvider();

    await processDueReminders(provider);

    const [message] = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(message.content?.startsWith(`${clinic.name} te espera ${client.name}! Turno de ${pet.name}:`)).toBe(true);
  });

  it("vuelve a usar el texto por defecto si el template se resetea a null", async () => {
    const { clinic, client, pet } = await setupClinic();
    await prisma.clinic.update({ where: { id: clinic.id }, data: { controlReminderTemplate: "Texto custom {cliente}" } });
    await prisma.clinic.update({ where: { id: clinic.id }, data: { controlReminderTemplate: null } });
    await createDueReminder(clinic.id, client.id, pet.id, { type: "CONTROL_DUE" });
    const provider = new CountingProvider();

    await processDueReminders(provider);

    const [message] = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(message.content).toContain("control pendiente");
    expect(message.content).not.toContain("Texto custom");
  });

  it("completa {dias} y {motivo} a partir del MedicalRecord vinculado", async () => {
    const { clinic, vet, client, pet } = await setupClinic();
    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { controlReminderTemplate: "{mascota}: faltan {dias} días para {motivo}." },
    });
    const nextDueDate = futureDate(7);
    const medicalRecord = await prisma.medicalRecord.create({
      data: { clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "VACCINE", reason: "vacuna antirrábica", nextDueDate },
    });
    await prisma.reminder.create({
      data: {
        clinicId: clinic.id,
        clientId: client.id,
        petId: pet.id,
        medicalRecordId: medicalRecord.id,
        type: "CONTROL_DUE",
        scheduledAt: pastDate(5),
        deduplicationKey: `test:${clinic.id}:${pet.id}:${Math.random()}`,
      },
    });
    const provider = new CountingProvider();

    await processDueReminders(provider);

    const [message] = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(message.content).toBe(`${pet.name}: faltan 7 días para vacuna antirrábica.`);
  });
});
