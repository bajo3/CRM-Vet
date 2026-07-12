import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { claimOutboundMessages, reportOutboundOutcome } from "@/lib/services/whatsapp-outbound";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

function authorized(request: NextRequest) {
  const token = process.env.INTERNAL_WHATSAPP_TOKEN;
  return Boolean(token && request.headers.get("x-internal-token") === token);
}

function rateLimited(request: NextRequest, route: string) {
  const ip = clientIpFromHeaders(request.headers);
  return !checkRateLimit(`${route}:${ip}`, 60, 60_000).allowed;
}

async function resolveClinic(clinicKey: string | null) {
  if (!clinicKey) return null;
  return getPrisma().clinic.findUnique({ where: { whatsappSessionKey: clinicKey }, select: { id: true } });
}

export async function GET(request: NextRequest) {
  if (rateLimited(request, "whatsapp-outbound-get")) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const clinicKey = request.nextUrl.searchParams.get("clinicKey");
  const clinic = await resolveClinic(clinicKey);
  if (!clinic) return NextResponse.json({ error: "clinic_not_found" }, { status: 404 });

  const claimed = await claimOutboundMessages(getPrisma(), clinic.id, 20);
  return NextResponse.json({ messages: claimed });
}

export async function POST(request: NextRequest) {
  if (rateLimited(request, "whatsapp-outbound-post")) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const clinicKey = request.nextUrl.searchParams.get("clinicKey");
  const clinic = await resolveClinic(clinicKey);
  if (!clinic) return NextResponse.json({ error: "clinic_not_found" }, { status: 404 });

  const body = (await request.json()) as { id?: string; status?: "SENT" | "FAILED"; externalMessageId?: string };
  if (!body.id || !["SENT", "FAILED"].includes(body.status ?? "")) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Si el id no pertenece a esta clínica, `reportOutboundOutcome` no actualiza nada (se ignora en
  // silencio): evita que una clínica pueda tocar mensajes de otra a través de este endpoint.
  await reportOutboundOutcome(getPrisma(), clinic.id, body.id, body.status!, body.externalMessageId);
  return NextResponse.json({ ok: true });
}
