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
import type { proto } from "@whiskeysockets/baileys";
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

// WhatsApp usa JIDs "@lid" como identidad principal. El CRM todavía identifica al cliente por
// teléfono, pero el envío debe conservar el LID del chat: convertirlo a PN hace que una respuesta
// parezca un chat nuevo y puede activar el bloqueo 463. Baileys v7 expone el PN alternativo en
// `remoteJidAlt`; `senderPn` queda sólo como compatibilidad con eventos recibidos antes de migrar.
type LidAwareKey = WAMessage["key"] & { senderPn?: string | null };

function inboundPhone(message: WAMessage): string {
  const key = message.key as LidAwareKey;
  const remoteJid = message.key.remoteJid ?? "";
  const alternatePn = key.remoteJidAlt ?? key.senderPn;
  if (remoteJid.endsWith("@lid") && alternatePn) return alternatePn.replace(/@.+$/, "");
  return remoteJid.replace(/@.+$/, "");
}

async function sendToCrm(message: WAMessage, text: string, phone: string): Promise<WhatsappEventResponse> {
  const response = await fetch(`${appUrl}/api/internal/whatsapp/events`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": internalToken! },
    body: JSON.stringify({
      eventId: message.key.id,
      clinicKey,
      phone,
      contactName: message.pushName || undefined,
      text,
      timestamp: new Date(Number(message.messageTimestamp) * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`CRM_HTTP_${response.status}`);
  return response.json() as Promise<WhatsappEventResponse>;
}

// ---------------------------------------------------------------------------
// Humanización y anti-ban
//
// WhatsApp detecta bots por patrones: respuestas instantáneas las 24hs, ráfagas
// de mensajes en el mismo segundo, envíos a números inexistentes y reconexiones
// agresivas en loop. Todo lo de esta sección apunta a que el número se comporte
// como una persona atendiendo el teléfono de la veterinaria.
// ---------------------------------------------------------------------------

type Socket = ReturnType<typeof makeWASocket>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const randomBetween = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

// Cola global de envíos: serializa TODOS los salientes (respuestas del bot y
// recordatorios) con una pausa aleatoria entre uno y otro. Una persona no manda
// cinco mensajes en el mismo segundo.
let sendChain: Promise<unknown> = Promise.resolve();
let lastSendAt = 0;

function queueSend<T>(task: () => Promise<T>): Promise<T> {
  const run = sendChain.then(async () => {
    const wait = lastSendAt + randomBetween(3_500, 8_000) - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastSendAt = Date.now();
    }
  });
  sendChain = run.catch(() => undefined);
  return run;
}

// Cache de mensajes enviados: si el teléfono del cliente pide un reintento de
// descifrado, Baileys reenvía el contenido en vez de dejar el mensaje clavado
// en un tilde gris para siempre.
const sentMessages = new Map<string, proto.IMessage>();

type InitialSendUpdate = { status: number; errorCode?: string };
const recentSendUpdates = new Map<string, InitialSendUpdate>();
const sendUpdateWaiters = new Map<string, (update: InitialSendUpdate | null) => void>();

function rememberSendUpdate(id: string, update: InitialSendUpdate) {
  recentSendUpdates.set(id, update);
  const waiter = sendUpdateWaiters.get(id);
  if (waiter) {
    sendUpdateWaiters.delete(id);
    waiter(update);
  }
  if (recentSendUpdates.size > 300) {
    const oldest = recentSendUpdates.keys().next().value;
    if (oldest) recentSendUpdates.delete(oldest);
  }
}

async function waitForInitialSendUpdate(id: string, timeoutMs = 2_000): Promise<InitialSendUpdate | null> {
  const existing = recentSendUpdates.get(id);
  if (existing) {
    recentSendUpdates.delete(id);
    return existing;
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sendUpdateWaiters.delete(id);
      resolve(null);
    }, timeoutMs);
    sendUpdateWaiters.set(id, (update) => {
      clearTimeout(timer);
      recentSendUpdates.delete(id);
      resolve(update);
    });
  });
}

function rememberSent(sent: WAMessage | undefined) {
  if (!sent?.key?.id || !sent.message) return;
  sentMessages.set(sent.key.id, sent.message);
  if (sentMessages.size > 200) {
    const oldest = sentMessages.keys().next().value;
    if (oldest) sentMessages.delete(oldest);
  }
}

// Envío que simula a una persona: aparece "escribiendo…" un tiempo proporcional
// al largo del texto y recién después sale el mensaje.
async function sendHumanized(socket: Socket, jid: string, text: string) {
  return queueSend(async () => {
    await socket.presenceSubscribe(jid).catch(() => undefined);
    await socket.sendPresenceUpdate("composing", jid).catch(() => undefined);
    await sleep(Math.min(Math.max(text.length * randomBetween(35, 60), 1_500), 8_000));
    await socket.sendPresenceUpdate("paused", jid).catch(() => undefined);
    const sent = await socket.sendMessage(jid, { text });
    rememberSent(sent ?? undefined);
    return sent;
  });
}

// Verifica que el número exista en WhatsApp antes de enviar (mandar a números
// inexistentes es una señal fuerte de spam) y usa el JID normalizado que
// devuelve WhatsApp — de paso arregla variantes como el 9 de los celulares
// argentinos. El resultado se cachea para no consultar lo mismo todo el día.
const knownNumbers = new Map<string, { jid: string | null; at: number }>();
const NUMBER_CACHE_TTL_MS = 12 * 60 * 60_000;

async function resolveJid(socket: Socket, phone: string): Promise<string | null> {
  const cached = knownNumbers.get(phone);
  if (cached && Date.now() - cached.at < NUMBER_CACHE_TTL_MS) return cached.jid;
  try {
    const pnJid = `${phone}@s.whatsapp.net`;
    const knownLid = await socket.signalRepository.lidMapping.getLIDForPN(pnJid);
    if (knownLid) {
      knownNumbers.set(phone, { jid: knownLid, at: Date.now() });
      return knownLid;
    }
    const result = (await socket.onWhatsApp(phone))?.[0];
    const normalizedPn = result?.exists && result.jid ? result.jid : null;
    const jid = normalizedPn
      ? (await socket.signalRepository.lidMapping.getLIDForPN(normalizedPn)) ?? normalizedPn
      : null;
    knownNumbers.set(phone, { jid, at: Date.now() });
    if (knownNumbers.size > 500) {
      const oldest = knownNumbers.keys().next().value;
      if (oldest) knownNumbers.delete(oldest);
    }
    return jid;
  } catch {
    // Si la consulta falla no bloqueamos un envío legítimo: probamos directo.
    return `${phone}@s.whatsapp.net`;
  }
}

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------

// La versión de WhatsApp Web se cachea: si el endpoint de versiones se cuelga o
// se cae, reconectamos igual con la última versión conocida en vez de dejar el
// bridge muerto (esto ya pasó en producción).
let cachedWaVersion: Awaited<ReturnType<typeof fetchLatestBaileysVersion>>["version"] | undefined;

async function resolveWaVersion() {
  try {
    const { version } = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("FETCH_VERSION_TIMEOUT")), 10_000)),
    ]);
    cachedWaVersion = version;
  } catch (error) {
    logger.warn(
      { code: error instanceof Error ? error.message : "UNKNOWN" },
      "No se pudo consultar la versión de WhatsApp Web; sigo con la última conocida"
    );
  }
  return cachedWaVersion;
}

// Backoff exponencial con jitter: reconectar en loop agresivo cada 2 segundos
// también es comportamiento de bot y puede escalar a un bloqueo del número.
let reconnectDelayMs = 2_000;

function scheduleReconnect(reason: string, minDelayMs = reconnectDelayMs) {
  const delay = minDelayMs + randomBetween(0, 1_000);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 60_000);
  logger.warn({ delay, reason }, "Reconexión programada");
  setTimeout(connectWithRetry, delay);
}

async function connect() {
  const { state, saveCreds } = await loadMultiFileAuthState(authDir);
  const version = await resolveWaVersion();
  const socket = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger,
    browser: ["Vet Simple", "Chrome", "1.0.0"],
    // Nunca marcamos el número "en línea" globalmente: el teléfono de la
    // veterinaria sigue recibiendo notificaciones normalmente.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // Keep-alive más frecuente que el default para que la sesión no se caiga
    // por inactividad detrás del proxy de Railway.
    keepAliveIntervalMs: 20_000,
    connectTimeoutMs: 30_000,
    defaultQueryTimeoutMs: 60_000,
    getMessage: async (key) => (key.id ? sentMessages.get(key.id) : undefined),
    // Grupos, difusiones, estados y canales se ignoran a nivel socket.
    shouldIgnoreJid: (jid: string) => jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter"),
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      // Un QR nuevo implica que la conexión con WhatsApp está viva: el backoff
      // vuelve a empezar para que el QR se renueve sin pausas largas.
      reconnectDelayMs = 2_000;
      void QRCode.toDataURL(qr, { width: 360, margin: 2, errorCorrectionLevel: "M" })
        .then((qrDataUrl) => updateBridgeState("WAITING_QR", qrDataUrl))
        .catch(() => updateBridgeState("WAITING_QR", null));
      logger.info("Nuevo QR listo en Configuración > WhatsApp");
    }

    if (connection === "open") {
      reconnectDelayMs = 2_000;
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
          .finally(() => scheduleReconnect("loggedOut", 1_000));
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        // Otra instancia abrió sesión con el mismo número. Pelear la conexión
        // con dos sockets a la vez es motivo clásico de ban: esperamos un
        // minuto entero antes de reintentar.
        updateBridgeState("RECONNECTING", null);
        logger.error("Conexión reemplazada por otra instancia; esperando antes de reintentar");
        scheduleReconnect("connectionReplaced", 60_000);
      } else {
        updateBridgeState("RECONNECTING", null);
        logger.warn({ statusCode }, "Conexión cerrada; reconectando");
        scheduleReconnect("close");
      }
    }
  });

  const outboundUrl = `${appUrl}/api/internal/whatsapp/outbound?clinicKey=${encodeURIComponent(clinicKey)}`;
  const reportOutbound = async (body: {
    id: string;
    status: "SENT" | "FAILED";
    externalMessageId?: string;
    retryable?: boolean;
  }) => {
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
  const flushOutbound = async (): Promise<Set<string>> => {
    const deliveredMessageIds = new Set<string>();
    if (flushing || bridgeState.status !== "CONNECTED") return deliveredMessageIds;
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
          const jid = await resolveJid(socket, message.phone);
          if (!jid) {
            logger.warn({ messageId: message.id, phone: message.phone }, "El número no tiene WhatsApp; se marca como fallido");
            await reportOutbound({ id: message.id, status: "FAILED", retryable: false });
            continue;
          }
          const sent = await sendHumanized(socket, jid, message.content);
          const externalMessageId = sent?.key.id;
          if (!externalMessageId) throw new Error("WHATSAPP_MESSAGE_ID_MISSING");
          const initialUpdate = await waitForInitialSendUpdate(externalMessageId);
          if (initialUpdate?.status === WAMessageStatus.ERROR) {
            const errorCode = initialUpdate.errorCode ?? "WHATSAPP_ERROR";
            const retryable = errorCode !== "463";
            logger.warn({ messageId: message.id, errorCode, retryable }, "WhatsApp rechazó el mensaje");
            await reportOutbound({ id: message.id, status: "FAILED", retryable });
            continue;
          }
          logger.info({ messageId: message.id, jidType: jid.replace(/^[^@]+/, "") }, "Mensaje saliente aceptado");
          const reported = await reportOutbound({ id: message.id, status: "SENT", externalMessageId });
          if (reported) deliveredMessageIds.add(message.id);
        } catch (error) {
          const code = error instanceof Error ? error.message : "UNKNOWN";
          const retryable = !/\b463\b/.test(code);
          logger.warn({ messageId: message.id, code, retryable }, "Falló el envío a WhatsApp");
          await reportOutbound({ id: message.id, status: "FAILED", retryable });
        }
      }
    } catch (error) {
      logger.warn({ code: error instanceof Error ? error.message : "UNKNOWN" }, "No se pudo vaciar la bandeja saliente");
    } finally {
      flushing = false;
    }
    return deliveredMessageIds;
  };

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      const jid = message.key.remoteJid;
      const text = messageText(message);
      if (!jid || !text || message.key.fromMe || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      try {
        const phone = inboundPhone(message);
        const isLid = jid.endsWith("@lid");
        knownNumbers.set(phone, { jid, at: Date.now() });
        if (isLid && phone !== jid.replace(/@.+$/, "")) {
          await socket.signalRepository.lidMapping
            .storeLIDPNMappings([{ lid: jid, pn: `${phone}@s.whatsapp.net` }])
            .catch((error) => logger.debug({ error }, "No se pudo persistir el mapeo LID/PN"));
        }
        logger.info({ lid: isLid, conocido: phone !== jid.replace(/@.+$/, "") || !isLid }, "Mensaje entrante procesado");
        const result = await sendToCrm(message, text, phone);
        const sentMessageIds = !result.duplicate ? await flushOutbound() : new Set<string>();
        // El tilde azul se manda recién después de que WhatsApp aceptó la respuesta. Así nunca
        // dejamos al cliente en visto si el servidor rechaza el mensaje.
        if (result.reply && result.outboundMessageId && sentMessageIds.has(result.outboundMessageId)) {
          await sleep(randomBetween(800, 2_500));
          await socket.readMessages([message.key]).catch(() => undefined);
        }
      } catch (error) {
        logger.error({ code: error instanceof Error ? error.message : "UNKNOWN" }, "No se pudo procesar un mensaje entrante");
      }
    }
  });

  socket.ev.on("messages.update", async (updates) => {
    const deliveryUrl = `${appUrl}/api/internal/whatsapp/delivery?clinicKey=${encodeURIComponent(clinicKey)}`;
    for (const { key, update } of updates) {
      if (!key.fromMe || !key.id || update.status == null) continue;
      const whatsappError = update.messageStubParameters?.[0];
      const numericStatus = Number(update.status);
      // Un SERVER_ACK todavía puede ser seguido por un rechazo del servidor. Para decidir si el
      // envío fue aceptado sólo despertamos al waiter ante error o entrega real; si no llega
      // ninguno, el timeout corto conserva el comportamiento normal de Baileys.
      if (numericStatus === WAMessageStatus.ERROR || numericStatus >= WAMessageStatus.DELIVERY_ACK) {
        rememberSendUpdate(key.id, {
          status: numericStatus,
          errorCode: typeof whatsappError === "string" ? whatsappError : undefined,
        });
      }
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
          whatsappError,
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
    scheduleReconnect("connectError");
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
