import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
function authorized(request: NextRequest) { const token=process.env.INTERNAL_WHATSAPP_TOKEN; return Boolean(token && request.headers.get("x-internal-token") === token); }
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const clinicKey=request.nextUrl.searchParams.get("clinicKey");
  const clinic=clinicKey ? await getPrisma().clinic.findUnique({ where: { whatsappSessionKey: clinicKey }, select: { id: true } }) : null;
  if(!clinic) return NextResponse.json({ error: "clinic_not_found" }, { status: 404 });
  const messages=await getPrisma().whatsappMessage.findMany({ where: { clinicId: clinic.id, status: "HUMAN_QUEUED", direction: "OUTBOUND" }, include: { conversation: { select: { phone: true } } }, orderBy: { createdAt: "asc" }, take: 20 });
  return NextResponse.json({ messages: messages.map((m)=>({ id:m.id, phone:m.conversation.phone, content:m.content })) });
}
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body=await request.json() as { id?: string; status?: "SENT"|"FAILED"; externalMessageId?: string };
  if(!body.id || !["SENT","FAILED"].includes(body.status ?? "")) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await getPrisma().whatsappMessage.update({ where: { id: body.id }, data: { status: body.status, externalMessageId: body.externalMessageId } });
  return NextResponse.json({ ok: true });
}
