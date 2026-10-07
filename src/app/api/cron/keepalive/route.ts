import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Lo llama una vez por día el cron de Vercel (ver `vercel.json`). El plan gratuito de Supabase pausa
// el proyecto tras una semana sin actividad, y con la base pausada se cae todo el panel: esta
// consulta mínima la mantiene despierta. No expone datos, por eso no requiere autenticación.
export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
