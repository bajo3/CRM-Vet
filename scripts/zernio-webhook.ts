// Registra (o actualiza) el webhook de Zernio que alimenta la bandeja de WhatsApp oficial.
// Uso: npm run zernio:webhook -- https://crm-vet-three.vercel.app
// Requiere ZERNIO_API_KEY y ZERNIO_WEBHOOK_SECRET (el mismo secreto que tiene configurado Vercel).
import "dotenv/config";

const API = "https://zernio.com/api/v1";
const NAME = "crm-vet-whatsapp";
const EVENTS = ["message.received", "message.sent", "message.delivered", "message.read", "message.failed"];

async function main() {
  const apiKey = process.env.ZERNIO_API_KEY;
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  const baseUrl = process.argv[2] ?? process.env.APP_URL;
  if (!apiKey || !secret || !baseUrl) {
    throw new Error("Faltan ZERNIO_API_KEY, ZERNIO_WEBHOOK_SECRET o la URL pública del CRM (argumento o APP_URL).");
  }
  const url = new URL("/api/whatsapp/zernio/webhook", baseUrl).toString();
  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };

  const list = await fetch(`${API}/webhooks/settings`, { headers });
  if (!list.ok) throw new Error(`No se pudo listar los webhooks (HTTP ${list.status}).`);
  const { webhooks = [] } = (await list.json()) as { webhooks?: { _id?: string; webhookId?: string; name?: string }[] };
  const existing = webhooks.find((webhook) => webhook.name === NAME);

  const body = { name: NAME, url, events: EVENTS, secret, isActive: true };
  const response = existing
    ? await fetch(`${API}/webhooks/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ webhookId: existing.webhookId ?? existing._id, ...body }),
      })
    : await fetch(`${API}/webhooks/settings`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Zernio rechazó el webhook (HTTP ${response.status}): ${await response.text()}`);

  console.log(`${existing ? "Actualizado" : "Creado"} el webhook ${NAME} -> ${url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
