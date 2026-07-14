import "dotenv/config";
import { createServer } from "node:http";
import { rm } from "node:fs/promises";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState as loadMultiFileAuthState,
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
  const { version } = await fetchLatestBaileysVersion();
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
          .finally(() => setTimeout(() => void connect(), 1_000));
      } else {
        updateBridgeState("RECONNECTING", null);
        logger.warn({ statusCode }, "Conexión cerrada; reconectando");
        setTimeout(() => void connect(), 2_000);
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      const jid = message.key.remoteJid;
      const text = messageText(message);
      if (!jid || !text || message.key.fromMe || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      try {
        const result = await sendToCrm(message, text);
        if (result.reply && !result.duplicate) await socket.sendMessage(jid, { text: result.reply });
      } catch (error) {
        logger.error({ code: error instanceof Error ? error.message : "UNKNOWN" }, "No se pudo procesar un mensaje entrante");
      }
    }
  });

  let flushing = false;
  const flushOutbound = async () => {
    if (flushing || bridgeState.status !== "CONNECTED") return;
    flushing = true;
    try {
      const outboundUrl = `${appUrl}/api/internal/whatsapp/outbound?clinicKey=${encodeURIComponent(clinicKey)}`;
      const response = await fetch(outboundUrl, {
        headers: { "x-internal-token": internalToken! },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`OUTBOUND_HTTP_${response.status}`);
      const payload = (await response.json()) as { messages: { id: string; phone: string; content: string }[] };
      for (const message of payload.messages) {
        try {
          const sent = await socket.sendMessage(`${message.phone}@s.whatsapp.net`, { text: message.content });
          await fetch(outboundUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "x-internal-token": internalToken! },
            body: JSON.stringify({ id: message.id, status: "SENT", externalMessageId: sent?.key.id }),
          });
        } catch {
          await fetch(outboundUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "x-internal-token": internalToken! },
            body: JSON.stringify({ id: message.id, status: "FAILED" }),
          });
        }
      }
    } catch (error) {
      logger.warn({ code: error instanceof Error ? error.message : "UNKNOWN" }, "No se pudo vaciar la bandeja saliente");
    } finally {
      flushing = false;
    }
  };

  const outboundTimer = setInterval(() => void flushOutbound(), 3_000);
  socket.ev.on("connection.update", ({ connection }) => {
    if (connection === "close") clearInterval(outboundTimer);
    if (connection === "open") void flushOutbound();
  });
}

void connect();
