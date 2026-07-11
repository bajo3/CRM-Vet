import "dotenv/config";
import pino from "pino";
import { processDueReminders } from "../src/lib/services/reminders";
import { MockWhatsAppProvider } from "../src/lib/services/whatsapp-provider";

const INTERVAL_MS = 60_000;
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "info" });
const provider = new MockWhatsAppProvider();

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
