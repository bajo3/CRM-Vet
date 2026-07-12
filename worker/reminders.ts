import "dotenv/config";
import pino from "pino";
import { processDueReminders } from "../src/lib/services/reminders";
import { MockWhatsAppProvider, OutboxWhatsAppProvider, type WhatsAppProvider } from "../src/lib/services/whatsapp-provider";

const INTERVAL_MS = 60_000;
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "info" });

// `mock` (default): no envía nada real, solo loguea — útil en desarrollo sin worker de Baileys.
// `outbox`: encola el recordatorio como WhatsappMessage HUMAN_QUEUED para que lo levante el worker
// de Baileys ya conectado (producción). Ver REMINDER_PROVIDER en .env.example / README.
const providerName = process.env.REMINDER_PROVIDER === "outbox" ? "outbox" : "mock";
const provider: WhatsAppProvider = providerName === "outbox" ? new OutboxWhatsAppProvider() : new MockWhatsAppProvider();
logger.info({ provider: providerName }, "Proveedor de WhatsApp para recordatorios");

async function runOnce() {
  const result = await processDueReminders(provider);
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  if (total > 0) logger.info(result, "Recordatorios procesados");
  else logger.debug("Sin recordatorios vencidos");
  return result;
}

async function main() {
  const once = process.argv.includes("--once");
  if (once) {
    await runOnce();
    return;
  }
  logger.info({ intervalMs: INTERVAL_MS }, "Worker de recordatorios iniciado");
  for (;;) {
    try {
      await runOnce();
    } catch (error) {
      logger.error({ code: error instanceof Error ? error.message : "UNKNOWN" }, "Fallo al procesar recordatorios");
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

void main();
