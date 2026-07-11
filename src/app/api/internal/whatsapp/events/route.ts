import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { incomingWhatsappEventSchema } from "@/lib/whatsapp/contracts";
import { processIncomingWhatsapp } from "@/lib/whatsapp/flow";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authorized(received: string | null) {
  const expected = process.env.INTERNAL_WHATSAPP_TOKEN;
  if (!expected || !received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-internal-token"))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = incomingWhatsappEventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  try {
    return NextResponse.json(await processIncomingWhatsapp(parsed.data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const clinic = await getPrisma().clinic.findUnique({ where: { whatsappSessionKey: parsed.data.clinicKey }, select: { id: true } }).catch(() => null);
    if (clinic) await getPrisma().webhookEvent.deleteMany({ where: { clinicId: clinic.id, externalEventId: parsed.data.eventId, processedAt: null } }).catch(() => undefined);
    console.error("No se pudo procesar el evento de WhatsApp", { code });
    return NextResponse.json({ error: "No se pudo procesar el evento" }, { status: 500 });
  }
}
