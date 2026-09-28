import "dotenv/config";
import pino from "pino";
import { processDueReminders } from "../src/lib/services/reminders";
import { getPrisma } from "../src/lib/prisma";
import { processDueScheduledMessages } from "../src/lib/services/scheduled-messages";
import { dispatchAllZernioOutboxes } from "../src/lib/services/zernio-outbox";
import { MockWhatsAppProvider, OutboxWhatsAppProvider, type WhatsAppProvider } from "../src/lib/services/whatsapp-provider";

const INTERVAL_MS = 60_000;
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "info" });

// `mock` (default): no envía nada real, solo loguea — útil en desarrollo.
// `outbox` (producción): encola el recordatorio como WhatsappMessage HUMAN_QUEUED y más abajo, en la
// misma vuelta, se envía por Zernio. Ver REMINDER_PROVIDER en .env.example / README.
const providerName = process.env.REMINDER_PROVIDER === "outbox" ? "outbox" : "mock";
const provider: WhatsAppProvider = providerName === "outbox" ? new OutboxWhatsAppProvider() : new MockWhatsAppProvider();
logger.info({ provider: providerName }, "Proveedor de WhatsApp para recordatorios");

async function runOnce() {
  const result = await processDueReminders(provider);
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  if (total > 0) logger.info(result, "Recordatorios procesados");
  else logger.debug("Sin recordatorios vencidos");

  // Mismo poll de 60s, misma instancia de `provider`: los mensajes programados a mano desde
  // /mensajes usan el mismo mecanismo de entrega que los recordatorios automáticos, así que no
  // hace falta un segundo servicio de Railway para esto.
  const scheduledResult = await processDueScheduledMessages(provider);
  const scheduledTotal = Object.values(scheduledResult).reduce((sum, value) => sum + value, 0);
  if (scheduledTotal > 0) logger.info(scheduledResult, "Mensajes programados procesados");
  else logger.debug("Sin mensajes programados vencidos");

  // Envía lo pendiente de la outbox por Zernio (recordatorios recién encolados y reintentos).
  const zernioResult = await dispatchAllZernioOutboxes(getPrisma());
  if (zernioResult.sent + zernioResult.failed > 0) logger.info(zernioResult, "Salientes enviados por Zernio");

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
