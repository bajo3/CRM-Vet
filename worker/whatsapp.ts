import "dotenv/config";
import { createServer } from "node:http";
import { rm } from "node:fs/promises";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState as loadMultiFileAuthState,
  WAMessageStatus,
  type WAMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import type { WhatsappEventResponse } from "../src/lib/whatsapp/contracts";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const clinicKey = process.env.WHATSAPP_CLINIC_KEY || "patitas-demo";
const authDir = process.env.WHATSAPP_AUTH_DIR || `.data/baileys/${clinicKey}`;
const internalToken = process.env.INTERNAL_WHATSAPP_TOKEN;
const port = Number(process.env.PORT || 3900);
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "info" });

if (!internalToken) throw new Error("Falta INTERNAL_WHATSAPP_TOKEN");

type BridgeStatus = "STARTING" | "WAITING_QR" | "CONNECTED" | "RECONNECTING" | "LOGGED_OUT";
const bridgeState: { status: BridgeStatus; qrDataUrl: string | null; updatedAt: string } = {
  status: "STARTING",
  qrDataUrl: null,
  updatedAt: new Date().toISOString(),
};

function updateBridgeState(status: BridgeStatus, qrDataUrl: string | null = bridgeState.qrDataUrl) {
  bridgeState.status = status;
  bridgeState.qrDataUrl = qrDataUrl;
  bridgeState.updatedAt = new Date().toISOString();
}

createServer((request, response) => {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (request.url === "/health") {
    response.writeHead(200);
    response.end(JSON.stringify({ ok: true, status: bridgeState.status }));
    return;
  }

  if (request.url === "/status") {
    if (request.headers["x-internal-token"] !== internalToken) {
      response.writeHead(401);
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    response.writeHead(200);
    response.end(JSON.stringify(bridgeState));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "not_found" }));
}).listen(port, "0.0.0.0", () => logger.info({ port }, "Panel de estado del bridge disponible"));

function messageText(message: WAMessage) {
  return (
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.videoMessage?.caption ||
    ""
  ).trim();
}

async function sendToCrm(message: WAMessage, text: string): Promise<WhatsappEventResponse> {
  const remoteJid = message.key.remoteJid!;
  const response = await fetch(`${appUrl}/api/internal/whatsapp/events`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": internalToken! },
    body: JSON.stringify({
      eventId: message.key.id,
      clinicKey,
      phone: remoteJid.replace(/@.+$/, ""),
      contactName: message.pushName || undefined,
      text,
      timestamp: new Date(Number(message.messageTimestamp) * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`CRM_HTTP_${response.status}`);
  return response.json() as Promise<WhatsappEventResponse>;
}

async function connect() {
  const { state, saveCreds } = await loadMultiFileAuthState(authDir);
  const { version } = await Promise.race([
    fetchLatestBaileysVersion(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("FETCH_VERSION_TIMEOUT")), 10_000)),
  ]);
  const socket = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ["Vet Simple", "Chrome", "1.0.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      void QRCode.toDataURL(qr, { width: 360, margin: 2, errorCorrectionLevel: "M" })
        .then((qrDataUrl) => updateBridgeState("WAITING_QR", qrDataUrl))
        .catch(() => updateBridgeState("WAITING_QR", null));
      logger.info("Nuevo QR listo en Configuración > WhatsApp");
    }

    if (connection === "open") {
      updateBridgeState("CONNECTED", null);
      logger.info({ clinicKey }, "WhatsApp conectado");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        updateBridgeState("LOGGED_OUT", null);
        logger.error("Sesión cerrada. Borrando credenciales viejas y generando un QR nuevo.");
        void rm(authDir, { recursive: true, force: true })
          .catch((error) => logger.error({ error }, "No se pudo borrar el directorio de credenciales"))
          .finally(() => setTimeout(connectWithRetry, 1_000));
      } else {
        updateBridgeState("RECONNECTING", null);
        logger.warn({ statusCode }, "Conexión cerrada; reconectando");
        setTimeout(connectWithRetry, 2_000);
      }
    }
  });

  const outboundUrl = `${appUrl}/api/internal/whatsapp/outbound?clinicKey=${encodeURIComponent(clinicKey)}`;
  const reportOutbound = async (body: { id: string; status: "SENT" | "FAILED"; externalMessageId?: string }) => {
    let lastCode = "UNKNOWN";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(outboundUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-token": internalToken! },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return true;
        lastCode = `HTTP_${response.status}`;
      } catch (error) {
        lastCode = error instanceof Error ? error.message : "UNKNOWN";
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
    logger.error({ messageId: body.id, outcome: body.status, code: lastCode }, "No se pudo registrar el resultado del envío");
    return false;
  };

  let flushing = false;
  const flushOutbound = async () => {
    if (flushing || bridgeState.status !== "CONNECTED") return;
    flushing = true;
    try {
      const response = await fetch(outboundUrl, {
        headers: { "x-internal-token": internalToken! },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`OUTBOUND_HTTP_${response.status}`);
      const payload = (await response.json()) as { messages: { id: string; phone: string; content: string }[] };
      for (const message of payload.messages) {
        try {
          const sent = await socket.sendMessage(`${message.phone}@s.whatsapp.net`, { text: message.content });
          await reportOutbound({ id: message.id, status: "SENT", externalMessageId: sent?.key.id ?? undefined });
        } catch (error) {
          logger.warn({ messageId: message.id, code: error instanceof Error ? error.message : "UNKNOWN" }, "Falló el envío a WhatsApp");
          await reportOutbound({ id: message.id, status: "FAILED" });
        }
      }
    } catch (error) {
      logger.warn({ code: error instanceof Error ? error.message : "UNKNOWN" }, "No se pudo vaciar la bandeja saliente");
    } finally {
      flushing = false;
    }
  };

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      const jid = message.key.remoteJid;
      const text = messageText(message);
      if (!jid || !text || message.key.fromMe || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      try {
        const result = await sendToCrm(message, text);
        // La respuesta del bot ya quedó persistida como `HUMAN_QUEUED`: se vacía por la misma outbox
        // que usan los mensajes humanos, con estados reales y reintentos.
        if (!result.duplicate) await flushOutbound();
      } catch (error) {
        logger.error({ code: error instanceof Error ? error.message : "UNKNOWN" }, "No se pudo procesar un mensaje entrante");
      }
    }
  });

  socket.ev.on("messages.update", async (updates) => {
    const deliveryUrl = `${appUrl}/api/internal/whatsapp/delivery?clinicKey=${encodeURIComponent(clinicKey)}`;
    for (const { key, update } of updates) {
      if (!key.fromMe || !key.id || update.status == null) continue;
      const status = update.status === WAMessageStatus.ERROR
        ? "FAILED"
        : update.status >= WAMessageStatus.READ
          ? "READ"
          : update.status >= WAMessageStatus.DELIVERY_ACK
            ? "DELIVERED"
            : null;
      if (!status) continue;
      try {
        const response = await fetch(deliveryUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-token": internalToken! },
          body: JSON.stringify({ externalMessageId: key.id, status }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`DELIVERY_HTTP_${response.status}`);
      } catch (error) {
        logger.warn({
          code: error instanceof Error ? error.message : "UNKNOWN",
          whatsappError: update.messageStubParameters?.[0],
        }, "No se pudo actualizar el estado final del mensaje");
      }
    }
  });

  const outboundTimer = setInterval(() => void flushOutbound(), 3_000);
  socket.ev.on("connection.update", ({ connection }) => {
    if (connection === "close") clearInterval(outboundTimer);
    if (connection === "open") void flushOutbound();
  });
}

function connectWithRetry() {
  connect().catch((error) => {
    logger.error({ error }, "Fallo al conectar; reintentando");
    setTimeout(connectWithRetry, 2_000);
  });
}

const WATCHDOG_STALL_MS = 3 * 60_000;
setInterval(() => {
  if (bridgeState.status === "CONNECTED") return;
  const idleMs = Date.now() - new Date(bridgeState.updatedAt).getTime();
  if (idleMs > WATCHDOG_STALL_MS) {
    logger.error({ idleMs }, "El bridge dejó de reportar actividad; reiniciando proceso");
    process.exit(1);
  }
}, 30_000);

connectWithRetry();
