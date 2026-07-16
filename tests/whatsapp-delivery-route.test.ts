import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/internal/whatsapp/delivery/route";
import { createTestClinic, createTestClient, prisma, resetDatabase } from "./setup/db";

const INTERNAL_TOKEN = "whatsapp-delivery-test-token";

async function setupMessage(clinicName: string, externalMessageId: string) {
  const clinic = await createTestClinic({ name: clinicName });
  const clinicKey = `key-${clinic.id}`;
  await prisma.clinic.update({ where: { id: clinic.id }, data: { whatsappSessionKey: clinicKey } });
  const client = await createTestClient(clinic.id);
  const conversation = await prisma.whatsappConversation.create({
    data: { clinicId: clinic.id, clientId: client.id, phone: client.phone },
  });
  const message = await prisma.whatsappMessage.create({
    data: {
      clinicId: clinic.id,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      content: "Mensaje de prueba",
      status: "SENT",
      externalMessageId,
    },
  });
  return { clinic, clinicKey, message };
}

function deliveryRequest(clinicKey: string, body: unknown, token = INTERNAL_TOKEN) {
  return new NextRequest(`http://localhost/api/internal/whatsapp/delivery?clinicKey=${encodeURIComponent(clinicKey)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `127.0.0.${Math.floor(Math.random() * 200) + 1}`,
      "x-internal-token": token,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/internal/whatsapp/delivery", () => {
  beforeEach(async () => {
    process.env.INTERNAL_WHATSAPP_TOKEN = INTERNAL_TOKEN;
    await resetDatabase();
  });

  it("rechaza confirmaciones sin el token interno", async () => {
    const { clinicKey } = await setupMessage("Clínica A", "wa-unauthorized");
    const response = await POST(deliveryRequest(clinicKey, { externalMessageId: "wa-unauthorized", status: "DELIVERED" }, "incorrecto"));
    expect(response.status).toBe(401);
  });

  it("registra entregado y leído para el mensaje de la clínica correcta", async () => {
    const { clinicKey, message } = await setupMessage("Clínica A", "wa-delivery-1");

    const delivered = await POST(deliveryRequest(clinicKey, { externalMessageId: "wa-delivery-1", status: "DELIVERED" }));
    expect(delivered.status).toBe(200);
    expect(await delivered.json()).toMatchObject({ ok: true, updated: true });
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("DELIVERED");

    const read = await POST(deliveryRequest(clinicKey, { externalMessageId: "wa-delivery-1", status: "READ" }));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ ok: true, updated: true });
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("READ");
  });

  it("nunca modifica un mensaje de otra clínica", async () => {
    const clinicA = await setupMessage("Clínica A", "wa-isolated");
    const clinicB = await setupMessage("Clínica B", "wa-other");

    const response = await POST(deliveryRequest(clinicB.clinicKey, { externalMessageId: "wa-isolated", status: "READ" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, updated: false });
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: clinicA.message.id } })).status).toBe("SENT");
  });

  it("rechaza estados desconocidos", async () => {
    const { clinicKey } = await setupMessage("Clínica A", "wa-invalid");
    const response = await POST(deliveryRequest(clinicKey, { externalMessageId: "wa-invalid", status: "SENT" }));
    expect(response.status).toBe(400);
  });
});
