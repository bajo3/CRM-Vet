import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as zernioWebhookPOST } from "../src/app/api/whatsapp/zernio/webhook/route";
import { dispatchZernioOutbox } from "../src/lib/services/zernio-outbox";
import { verifyZernioSignature } from "../src/lib/whatsapp/zernio-client";
import { handleZernioWebhook, type ZernioWebhookEvent } from "../src/lib/whatsapp/zernio-webhook";
import { createTestClinic, prisma, resetDatabase } from "./setup/db";

const SECRET = "zernio-test-secret";
const PHONE = "5491100000077";

async function createZernioClinic() {
  const clinic = await createTestClinic({ name: "Clínica Zernio" });
  return prisma.clinic.update({
    where: { id: clinic.id },
    data: { status: "APPROVED", zernioAccountId: `acc-${randomUUID()}` },
  });
}

function receivedEvent(accountId: string, overrides: Partial<{ messageId: string; text: string; conversationId: string }> = {}): ZernioWebhookEvent {
  const conversationId = overrides.conversationId ?? "zconv-1";
  return {
    id: `evt-${randomUUID()}`,
    event: "message.received",
    message: {
      id: overrides.messageId ?? `zmsg-${randomUUID()}`,
      conversationId,
      platform: "whatsapp",
      platformMessageId: `wamid.${randomUUID()}`,
      direction: "incoming",
      text: overrides.text ?? "hola",
      attachments: [],
      sender: { id: PHONE, name: "Laura", phoneNumber: `+${PHONE}` },
      sentAt: new Date().toISOString(),
    },
    conversation: { id: conversationId },
    account: { id: accountId, accountId },
    timestamp: new Date().toISOString(),
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("canal de WhatsApp vía Zernio", () => {
  beforeEach(async () => {
    process.env.ZERNIO_API_KEY = "sk_test";
    process.env.ZERNIO_WEBHOOK_SECRET = SECRET;
    await resetDatabase();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("verifica la firma HMAC-SHA256 del cuerpo crudo", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyZernioSignature(body, signature, SECRET)).toBe(true);
    expect(verifyZernioSignature(body, signature, "otro-secreto")).toBe(false);
    expect(verifyZernioSignature(body, null, SECRET)).toBe(false);
  });

  it("el webhook rechaza pedidos sin firma válida", async () => {
    const request = new NextRequest("http://localhost/api/whatsapp/zernio/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-zernio-signature": "firma-falsa" },
      body: JSON.stringify({ id: "evt", event: "message.received" }),
    });
    const response = await zernioWebhookPOST(request);
    expect(response.status).toBe(401);
  });

  it("un mensaje entrante crea la conversación, recuerda el id de Zernio y encola la respuesta del bot", async () => {
    const clinic = await createZernioClinic();
    const outcome = await handleZernioWebhook(receivedEvent(clinic.zernioAccountId!));
    expect(outcome).toMatchObject({ handled: true, kind: "incoming", queuedReply: true });

    const conversation = await prisma.whatsappConversation.findFirstOrThrow({ where: { clinicId: clinic.id, phone: PHONE } });
    expect(conversation.zernioConversationId).toBe("zconv-1");
    expect(conversation.lastInboundAt).not.toBeNull();
    const queued = await prisma.whatsappMessage.findMany({ where: { conversationId: conversation.id, direction: "OUTBOUND" } });
    expect(queued).toHaveLength(1);
    expect(queued[0].status).toBe("HUMAN_QUEUED");
  });

  it("un reintento del mismo mensaje entrante no se procesa dos veces", async () => {
    const clinic = await createZernioClinic();
    const event = receivedEvent(clinic.zernioAccountId!, { messageId: "zmsg-dup" });
    await handleZernioWebhook(event);
    const second = await handleZernioWebhook(event);
    expect(second).toMatchObject({ handled: true, queuedReply: false });
    expect(await prisma.whatsappMessage.count({ where: { clinicId: clinic.id, direction: "INBOUND" } })).toBe(1);
  });

  it("ignora eventos de cuentas que no pertenecen a ninguna clínica", async () => {
    await createZernioClinic();
    const outcome = await handleZernioWebhook(receivedEvent("acc-desconocida"));
    expect(outcome).toMatchObject({ handled: false, reason: "unknown_account" });
    expect(await prisma.whatsappMessage.count()).toBe(0);
  });

  it("dentro de la ventana de 24 h responde en la conversación existente de Zernio", async () => {
    const clinic = await createZernioClinic();
    await handleZernioWebhook(receivedEvent(clinic.zernioAccountId!));

    const fetchMock = vi.fn(async () => jsonResponse(200, { messageId: "zout-1", conversationId: "zconv-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await dispatchZernioOutbox(prisma, clinic.id);
    expect(result).toEqual({ sent: 1, failed: 0 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/inbox/conversations/zconv-1/messages");
    expect(JSON.parse(init.body as string)).toMatchObject({ accountId: clinic.zernioAccountId });

    const sent = await prisma.whatsappMessage.findFirstOrThrow({ where: { clinicId: clinic.id, direction: "OUTBOUND" } });
    expect(sent).toMatchObject({ status: "SENT", externalMessageId: "zout-1" });
  });

  it("fuera de la ventana (ej. un recordatorio) abre la conversación con un mensaje de utilidad", async () => {
    const clinic = await createZernioClinic();
    const conversation = await prisma.whatsappConversation.create({ data: { clinicId: clinic.id, phone: PHONE } });
    await prisma.whatsappMessage.create({
      data: { clinicId: clinic.id, conversationId: conversation.id, direction: "OUTBOUND", content: "Recordatorio", status: "HUMAN_QUEUED" },
    });

    const fetchMock = vi.fn(async () => jsonResponse(201, { success: true, data: { messageId: "wamid.X", conversationId: "zconv-new" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await dispatchZernioOutbox(prisma, clinic.id)).toEqual({ sent: 1, failed: 0 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/inbox\/conversations$/);
    expect(JSON.parse(init.body as string)).toMatchObject({ participantId: PHONE, category: "utility", message: "Recordatorio" });
    expect((await prisma.whatsappConversation.findUniqueOrThrow({ where: { id: conversation.id } })).zernioConversationId).toBe("zconv-new");
  });

  it("un rechazo permanente de Meta deja el mensaje como no enviado sin reintentar", async () => {
    const clinic = await createZernioClinic();
    const conversation = await prisma.whatsappConversation.create({ data: { clinicId: clinic.id, phone: PHONE } });
    const message = await prisma.whatsappMessage.create({
      data: { clinicId: clinic.id, conversationId: conversation.id, direction: "OUTBOUND", content: "Hola", status: "HUMAN_QUEUED" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(400, { error: "not eligible", code: "DIRECT_SEND_NOT_ELIGIBLE" })));

    expect(await dispatchZernioOutbox(prisma, clinic.id)).toEqual({ sent: 0, failed: 1 });
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("FAILED");
  });

  it("no envía mensajes que esperaron demasiado en la cola (ej. antes de conectar WhatsApp)", async () => {
    const clinic = await createZernioClinic();
    const conversation = await prisma.whatsappConversation.create({ data: { clinicId: clinic.id, phone: PHONE } });
    const message = await prisma.whatsappMessage.create({
      data: {
        clinicId: clinic.id,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: "Tu turno es mañana",
        status: "HUMAN_QUEUED",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await dispatchZernioOutbox(prisma, clinic.id)).toEqual({ sent: 0, failed: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("FAILED");
  });

  it("un error transitorio vuelve el mensaje a la cola para reintentarlo", async () => {
    const clinic = await createZernioClinic();
    const conversation = await prisma.whatsappConversation.create({ data: { clinicId: clinic.id, phone: PHONE } });
    const message = await prisma.whatsappMessage.create({
      data: { clinicId: clinic.id, conversationId: conversation.id, direction: "OUTBOUND", content: "Hola", status: "HUMAN_QUEUED" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(503, { error: "unavailable" })));

    await dispatchZernioOutbox(prisma, clinic.id);
    expect(await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({ status: "HUMAN_QUEUED", attempts: 1 });
  });

  it("registra entregado y leído a partir de los webhooks de Zernio", async () => {
    const clinic = await createZernioClinic();
    const conversation = await prisma.whatsappConversation.create({ data: { clinicId: clinic.id, phone: PHONE, zernioConversationId: "zconv-1" } });
    const message = await prisma.whatsappMessage.create({
      data: { clinicId: clinic.id, conversationId: conversation.id, direction: "OUTBOUND", content: "Hola", status: "SENT", externalMessageId: "wamid.ABC" },
    });
    const base = receivedEvent(clinic.zernioAccountId!);
    await handleZernioWebhook({ ...base, event: "message.delivered", message: { ...base.message!, id: "zmsg-other", platformMessageId: "wamid.ABC", direction: "outgoing" } });
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("DELIVERED");
    await handleZernioWebhook({ ...base, event: "message.read", message: { ...base.message!, id: "zmsg-other", platformMessageId: "wamid.ABC", direction: "outgoing" } });
    expect((await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe("READ");
  });

  it("una respuesta escrita desde el teléfono queda en la bandeja y frena al bot", async () => {
    const clinic = await createZernioClinic();
    const conversation = await prisma.whatsappConversation.create({ data: { clinicId: clinic.id, phone: PHONE, zernioConversationId: "zconv-1" } });
    const base = receivedEvent(clinic.zernioAccountId!);
    const outcome = await handleZernioWebhook({
      ...base,
      event: "message.sent",
      message: { ...base.message!, direction: "outgoing", text: "Te atiendo yo", source: "whatsapp_business_app" },
    });
    expect(outcome).toMatchObject({ handled: true, kind: "echo" });
    expect((await prisma.whatsappConversation.findUniqueOrThrow({ where: { id: conversation.id } })).status).toBe("HUMAN_ACTIVE");
    expect(await prisma.whatsappMessage.findFirst({ where: { conversationId: conversation.id, content: "Te atiendo yo", status: "SENT" } })).not.toBeNull();
  });
});
