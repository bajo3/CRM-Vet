import "dotenv/config";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState as loadMultiFileAuthState, type WAMessage } from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import type { WhatsappEventResponse } from "../src/lib/whatsapp/contracts";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const clinicKey = process.env.WHATSAPP_CLINIC_KEY || "patitas-demo";
const authDir = process.env.WHATSAPP_AUTH_DIR || `.data/baileys/${clinicKey}`;
const internalToken = process.env.INTERNAL_WHATSAPP_TOKEN;
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "info" });

if (!internalToken) throw new Error("Falta INTERNAL_WHATSAPP_TOKEN");

function messageText(message: WAMessage) {
  return (message.message?.conversation || message.message?.extendedTextMessage?.text || message.message?.imageMessage?.caption || message.message?.videoMessage?.caption || "").trim();
}

async function sendToCrm(message: WAMessage, text: string): Promise<WhatsappEventResponse> {
  const remoteJid = message.key.remoteJid!;
  const response = await fetch(`${appUrl}/api/internal/whatsapp/events`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": internalToken! },
    body: JSON.stringify({ eventId: message.key.id, clinicKey, phone: remoteJid.replace(/@.+$/, ""), contactName: message.pushName || undefined, text, timestamp: new Date(Number(message.messageTimestamp) * 1000).toISOString() }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`CRM_HTTP_${response.status}`);
  return response.json() as Promise<WhatsappEventResponse>;
}

async function connect() {
  const { state, saveCreds } = await loadMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({ version, auth: state, logger, browser: ["Vet Simple", "Chrome", "1.0.0"], markOnlineOnConnect: false, syncFullHistory: false });
  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) { logger.info("Escaneá este QR desde WhatsApp > Dispositivos vinculados"); qrcode.generate(qr, { small: true }); }
    if (connection === "open") logger.info({ clinicKey }, "WhatsApp conectado");
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) logger.error("Sesión cerrada. Borrá WHATSAPP_AUTH_DIR y vinculá nuevamente.");
      else { logger.warn({ statusCode }, "Conexión cerrada; reconectando"); setTimeout(() => void connect(), 2_000); }
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
  const flushOutbound = async () => {
    try {
      const response = await fetch(`${appUrl}/api/internal/whatsapp/outbound?clinicKey=${encodeURIComponent(clinicKey)}`, { headers: { "x-internal-token": internalToken! }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`OUTBOUND_HTTP_${response.status}`);
      const payload = await response.json() as { messages: { id: string; phone: string; content: string }[] };
      for (const message of payload.messages) {
        try {
          const sent = await socket.sendMessage(`${message.phone}@s.whatsapp.net`, { text: message.content });
          await fetch(`${appUrl}/api/internal/whatsapp/outbound`, { method: "POST", headers: { "content-type": "application/json", "x-internal-token": internalToken! }, body: JSON.stringify({ id: message.id, status: "SENT", externalMessageId: sent?.key.id }) });
        } catch { await fetch(`${appUrl}/api/internal/whatsapp/outbound`, { method: "POST", headers: { "content-type": "application/json", "x-internal-token": internalToken! }, body: JSON.stringify({ id: message.id, status: "FAILED" }) }); }
      }
    } catch (error) { logger.warn({ code: error instanceof Error ? error.message : "UNKNOWN" }, "No se pudo vaciar la bandeja saliente"); }
  };
  const outboundTimer = setInterval(() => void flushOutbound(), 3_000);
  socket.ev.on("connection.update", ({ connection }) => { if (connection === "close") clearInterval(outboundTimer); if (connection === "open") void flushOutbound(); });
}

void connect();
