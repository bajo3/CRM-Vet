import { after, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { dispatchZernioOutbox } from "@/lib/services/zernio-outbox";
import { verifyZernioSignature } from "@/lib/whatsapp/zernio-client";
import { handleZernioWebhook, zernioWebhookSchema } from "@/lib/whatsapp/zernio-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook de Zernio (mensajes entrantes, confirmaciones de entrega y mensajes enviados desde el
// teléfono). Se registra una sola vez para todo el equipo de Zernio con `npm run zernio:webhook`;
// cada evento trae la cuenta de WhatsApp y de ahí se deduce la clínica.
export async function POST(request: Request) {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "No configurado" }, { status: 503 });

  const rawBody = await request.text();
  if (!verifyZernioSignature(rawBody, request.headers.get("x-zernio-signature"), secret)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  }
  const parsed = zernioWebhookSchema.safeParse(json);
  // Formas que no conocemos (eventos de prueba, otras plataformas) se aceptan para que Zernio no
  // las reintente, pero no se procesan.
  if (!parsed.success) return NextResponse.json({ ok: true, handled: false });

  try {
    const outcome = await handleZernioWebhook(parsed.data);
    if (outcome.handled && outcome.kind === "incoming" && outcome.queuedReply) {
      // La respuesta del bot ya quedó en la outbox. Zernio exige un 2xx en menos de 5 s, así que
      // se envía después de contestarle; si falla, el worker de recordatorios la reintenta.
      const clinicId = outcome.clinicId;
      after(async () => {
        await dispatchZernioOutbox(getPrisma(), clinicId).catch((error) => {
          console.error("No se pudo despachar la respuesta por Zernio", { code: error instanceof Error ? error.message : "UNKNOWN" });
        });
      });
    }
    return NextResponse.json({ ok: true, handled: outcome.handled });
  } catch (error) {
    console.error("No se pudo procesar el webhook de Zernio", { code: error instanceof Error ? error.message : "UNKNOWN" });
    return NextResponse.json({ error: "No se pudo procesar el evento" }, { status: 500 });
  }
}
