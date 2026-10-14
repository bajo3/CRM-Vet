import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Lo llama una vez por día el cron de Vercel (ver `vercel.json`). El plan gratuito de Supabase pausa
// el proyecto tras una semana sin actividad, y con la base pausada se cae todo el panel. Un `SELECT 1`
// no alcanza (se pausó igual el 14/10/2026): hace falta una escritura real, así que se actualiza la
// fila de latido. No expone datos, por eso no requiere autenticación.
export async function GET() {
  try {
    const beatAt = new Date();
    await getPrisma().heartbeat.upsert({ where: { id: "keepalive" }, create: { id: "keepalive", beatAt }, update: { beatAt } });
    return NextResponse.json({ ok: true, beatAt });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
