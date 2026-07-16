import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { reportOutboundDelivery } from "@/lib/services/whatsapp-outbound";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

function authorized(request: NextRequest) {
  const token = process.env.INTERNAL_WHATSAPP_TOKEN;
  return Boolean(token && request.headers.get("x-internal-token") === token);
}

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  if (!checkRateLimit(`whatsapp-delivery:${ip}`, 120, 60_000).allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const clinicKey = request.nextUrl.searchParams.get("clinicKey");
  const clinic = clinicKey
    ? await getPrisma().clinic.findUnique({ where: { whatsappSessionKey: clinicKey }, select: { id: true } })
    : null;
  if (!clinic) return NextResponse.json({ error: "clinic_not_found" }, { status: 404 });

  const body = (await request.json()) as { externalMessageId?: string; status?: "DELIVERED" | "READ" };
  if (!body.externalMessageId || !["DELIVERED", "READ"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const updated = await reportOutboundDelivery(getPrisma(), clinic.id, body.externalMessageId, body.status!);
  return NextResponse.json({ ok: true, updated });
}
