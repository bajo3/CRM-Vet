import { beforeEach, describe, expect, it } from "vitest";
import { claimOutboundMessages, MAX_OUTBOUND_ATTEMPTS, reportOutboundDelivery, reportOutboundOutcome } from "../src/lib/services/whatsapp-outbound";
import { createTestClinic, createTestClient, resetDatabase, prisma } from "./setup/db";

async function queueMessage(clinicId: string, phone: string, content = "Hola, este es un mensaje de prueba") {
  const conversation = await prisma.whatsappConversation.upsert({
    where: { clinicId_phone: { clinicId, phone } },
    create: { clinicId, phone },
    update: {},
  });
  return prisma.whatsappMessage.create({
    data: { clinicId, conversationId: conversation.id, direction: "OUTBOUND", content, status: "HUMAN_QUEUED" },
  });
}

describe("whatsapp-outbound: reclamo atómico y reintentos", () => {
  beforeEach(resetDatabase);

  it("reclama los mensajes HUMAN_QUEUED de la clínica y los pasa a SENDING", async () => {
    const clinic = await createTestClinic();
    const client = await createTestClient(clinic.id);
    const message = await queueMessage(clinic.id, client.phone);

    const claimed = await claimOutboundMessages(prisma, clinic.id, 20);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ id: message.id, phone: client.phone });

    const updated = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe("SENDING");
  });

  it("no reenvía mensajes históricos QUEUED al activar la nueva outbox", async () => {
    const clinic = await createTestClinic();
    const client = await createTestClient(clinic.id);
    const message = await queueMessage(clinic.id, client.phone);
    await prisma.whatsappMessage.update({ where: { id: message.id }, data: { status: "QUEUED" } });

    const claimed = await claimOutboundMessages(prisma, clinic.id, 20);

    expect(claimed.map((item) => item.id)).not.toContain(message.id);
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("QUEUED");
  });

  it("dos reclamos concurrentes sobre los mismos mensajes nunca devuelven el mismo mensaje dos veces", async () => {
    const clinic = await createTestClinic();
    const client = await createTestClient(clinic.id);
    const messages = await Promise.all([
      queueMessage(clinic.id, client.phone, "Mensaje 1"),
      queueMessage(clinic.id, client.phone, "Mensaje 2"),
      queueMessage(clinic.id, client.phone, "Mensaje 3"),
    ]);

    const [claimedA, claimedB] = await Promise.all([
      claimOutboundMessages(prisma, clinic.id, 20),
      claimOutboundMessages(prisma, clinic.id, 20),
    ]);

    const idsA = claimedA.map((m) => m.id);
    const idsB = claimedB.map((m) => m.id);
    const overlap = idsA.filter((id) => idsB.includes(id));

    expect(overlap).toHaveLength(0);
    expect(idsA.length + idsB.length).toBe(messages.length);

    // Un tercer reclamo, después de que los dos anteriores ya se llevaron todo, no debe encontrar nada.
    const claimedC = await claimOutboundMessages(prisma, clinic.id, 20);
    expect(claimedC).toHaveLength(0);
  });

  it("no reclama mensajes que ya estén SENDING/SENT/FAILED, ni de otra clínica", async () => {
    const clinicA = await createTestClinic({ name: "Clínica A" });
    const clinicB = await createTestClinic({ name: "Clínica B" });
    const clientA = await createTestClient(clinicA.id);
    const clientB = await createTestClient(clinicB.id);

    await queueMessage(clinicB.id, clientB.phone);
    const messageA = await queueMessage(clinicA.id, clientA.phone);

    const claimed = await claimOutboundMessages(prisma, clinicA.id, 20);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(messageA.id);
  });

  it("reportOutboundOutcome(SENT) marca SENT y guarda el externalMessageId", async () => {
    const clinic = await createTestClinic();
    const client = await createTestClient(clinic.id);
    const message = await queueMessage(clinic.id, client.phone);
    await claimOutboundMessages(prisma, clinic.id, 20);

    const ok = await reportOutboundOutcome(prisma, clinic.id, message.id, "SENT", "wa-msg-123");

    expect(ok).toBe(true);
    const updated = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.externalMessageId).toBe("wa-msg-123");
  });

  it("registra las confirmaciones de entregado y leído de WhatsApp", async () => {
    const clinic = await createTestClinic();
    const client = await createTestClient(clinic.id);
    const message = await queueMessage(clinic.id, client.phone);
    await claimOutboundMessages(prisma, clinic.id, 20);
    await reportOutboundOutcome(prisma, clinic.id, message.id, "SENT", "wa-receipt-123");

    expect(await reportOutboundDelivery(prisma, clinic.id, "wa-receipt-123", "DELIVERED")).toBe(true);
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("DELIVERED");
    expect(await reportOutboundDelivery(prisma, clinic.id, "wa-receipt-123", "READ")).toBe(true);
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("READ");
  });

  it("marca FAILED cuando WhatsApp rechaza un mensaje después de aceptarlo para envío", async () => {
    const clinic = await createTestClinic();
    const client = await createTestClient(clinic.id);
    const message = await queueMessage(clinic.id, client.phone);
    await claimOutboundMessages(prisma, clinic.id, 20);
    await reportOutboundOutcome(prisma, clinic.id, message.id, "SENT", "wa-rejected-463");

    expect(await reportOutboundDelivery(prisma, clinic.id, "wa-rejected-463", "FAILED")).toBe(true);
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("FAILED");
    expect(await reportOutboundDelivery(prisma, clinic.id, "wa-rejected-463", "DELIVERED")).toBe(false);
  });

  it("reportOutboundOutcome nunca toca un mensaje de otra clínica (aislamiento multiempresa)", async () => {
    const clinicA = await createTestClinic({ name: "Clínica A" });
    const clinicB = await createTestClinic({ name: "Clínica B" });
    const clientA = await createTestClient(clinicA.id);
    const message = await queueMessage(clinicA.id, clientA.phone);
    await claimOutboundMessages(prisma, clinicA.id, 20);

    const ok = await reportOutboundOutcome(prisma, clinicB.id, message.id, "SENT", "wa-should-not-apply");

    expect(ok).toBe(false);
    const untouched = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(untouched.status).toBe("SENDING");
    expect(untouched.externalMessageId).toBeNull();
  });

  it(`reintenta hasta ${MAX_OUTBOUND_ATTEMPTS} veces y luego queda FAILED definitivo`, async () => {
    const clinic = await createTestClinic();
    const client = await createTestClient(clinic.id);
    const message = await queueMessage(clinic.id, client.phone);

    for (let attempt = 1; attempt <= MAX_OUTBOUND_ATTEMPTS; attempt++) {
      await claimOutboundMessages(prisma, clinic.id, 20);
      const ok = await reportOutboundOutcome(prisma, clinic.id, message.id, "FAILED");
      expect(ok).toBe(true);

      const current = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } });
      expect(current.attempts).toBe(attempt);
      if (attempt < MAX_OUTBOUND_ATTEMPTS) {
        expect(current.status).toBe("HUMAN_QUEUED");
      } else {
        expect(current.status).toBe("FAILED");
      }
    }

    // Ya no debe volver a reclamarse: quedó FAILED definitivo, no HUMAN_QUEUED.
    const claimedAfterFailure = await claimOutboundMessages(prisma, clinic.id, 20);
    expect(claimedAfterFailure).toHaveLength(0);
  });
});
