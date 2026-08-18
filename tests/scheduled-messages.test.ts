import { beforeEach, describe, expect, it } from "vitest";
import { OutboxWhatsAppProvider, type WhatsAppProvider } from "../src/lib/services/whatsapp-provider";
import { processDueScheduledMessages } from "../src/lib/services/scheduled-messages";
import { createTestClient, createTestClinic, createTestVet, resetDatabase, prisma } from "./setup/db";

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

async function setupClinic() {
  const clinic = await createTestClinic();
  const user = await createTestVet(clinic.id);
  const client = await createTestClient(clinic.id);
  return { clinic, user, client };
}

async function createDueScheduledMessage(clinicId: string, clientId: string, userId: string, content = "Hola! Este es un mensaje de prueba.") {
  return prisma.scheduledMessage.create({
    data: { clinicId, clientId, userId, content, scheduledAt: pastDate(5) },
  });
}

describe("mensajes programados: envío y reintentos", () => {
  beforeEach(resetDatabase);

  it("envía un mensaje programado vencido, lo marca SENT y registra el mensaje saliente", async () => {
    const { clinic, user, client } = await setupClinic();
    const scheduled = await createDueScheduledMessage(clinic.id, client.id, user.id);
    const provider = new CountingProvider();

    const result = await processDueScheduledMessages(provider);

    expect(result.sent).toBe(1);
    const updated = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.externalMessageId).toBeTruthy();
    expect(updated.sentAt).toBeTruthy();

    const messages = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe(scheduled.content);
  });

  it("no envía dos veces: correr el proceso dos veces seguidas envía una sola vez", async () => {
    const { clinic, user, client } = await setupClinic();
    await createDueScheduledMessage(clinic.id, client.id, user.id);
    const provider = new CountingProvider();

    const first = await processDueScheduledMessages(provider);
    const second = await processDueScheduledMessages(provider);

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(provider.calls).toBe(1);
  });

  it("un proveedor que siempre falla deja el mensaje FAILED al tercer intento, sin duplicar mensajes", async () => {
    const { clinic, user, client } = await setupClinic();
    const scheduled = await createDueScheduledMessage(clinic.id, client.id, user.id);
    const provider = new FailingProvider();

    const r1 = await processDueScheduledMessages(provider);
    expect(r1.retried).toBe(1);
    let current = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(current.status).toBe("PENDING");
    expect(current.attempts).toBe(1);

    const r2 = await processDueScheduledMessages(provider);
    expect(r2.retried).toBe(1);
    current = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(current.status).toBe("PENDING");
    expect(current.attempts).toBe(2);

    const r3 = await processDueScheduledMessages(provider);
    expect(r3.failed).toBe(1);
    current = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(current.status).toBe("FAILED");
    expect(current.attempts).toBe(3);

    const r4 = await processDueScheduledMessages(provider);
    expect(r4.sent + r4.retried + r4.failed).toBe(0);
    expect(provider.calls).toBe(3);

    const messages = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messages).toHaveLength(0);
  });

  it("no envía un mensaje CANCELLED aunque su scheduledAt ya haya pasado", async () => {
    const { clinic, user, client } = await setupClinic();
    const scheduled = await createDueScheduledMessage(clinic.id, client.id, user.id);
    await prisma.scheduledMessage.update({ where: { id: scheduled.id }, data: { status: "CANCELLED" } });
    const provider = new CountingProvider();

    const result = await processDueScheduledMessages(provider);

    expect(result.sent).toBe(0);
    expect(provider.calls).toBe(0);
  });

  it("OutboxWhatsAppProvider encola el mensaje como HUMAN_QUEUED y processDueScheduledMessages lo marca SENT sin duplicar", async () => {
    const { clinic, user, client } = await setupClinic();
    const scheduled = await createDueScheduledMessage(clinic.id, client.id, user.id);
    const provider = new OutboxWhatsAppProvider();

    const result = await processDueScheduledMessages(provider);

    expect(result.sent).toBe(1);
    const updated = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(updated.status).toBe("SENT");

    const messages = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("HUMAN_QUEUED");
    expect(messages[0].id).toBe(updated.externalMessageId);

    const second = await processDueScheduledMessages(provider);
    expect(second.sent).toBe(0);
    const messagesAfterSecondRun = await prisma.whatsappMessage.findMany({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(messagesAfterSecondRun).toHaveLength(1);
  });

  it("envía un mensaje aunque el cliente tenga los recordatorios desactivados (opt-out no aplica a un mensaje puntual)", async () => {
    const { clinic, user, client } = await setupClinic();
    await prisma.client.update({ where: { id: client.id }, data: { remindersEnabled: false } });
    await createDueScheduledMessage(clinic.id, client.id, user.id);
    const provider = new CountingProvider();

    const result = await processDueScheduledMessages(provider);

    expect(result.sent).toBe(1);
    expect(provider.calls).toBe(1);
  });
});
