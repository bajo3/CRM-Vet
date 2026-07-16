import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
  if (!session || (!summaryOnly && !hasRole(session, CLINIC_CONFIG_ROLES))) {
    return NextResponse.json({ status: "UNAVAILABLE" }, { status: 403 });
  }

  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL;
  const internalToken = process.env.INTERNAL_WHATSAPP_TOKEN;
  if (!bridgeUrl || !internalToken) {
    return NextResponse.json({ status: "NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/status`, {
      headers: { "x-internal-token": internalToken },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("BRIDGE_UNAVAILABLE");
    const payload = (await response.json()) as { status?: string; qrDataUrl?: string | null; updatedAt?: string };
    return NextResponse.json({
      status: payload.status ?? "UNAVAILABLE",
      // El resumen de la bandeja está disponible para cualquier miembro autenticado, pero el QR
      // de vinculación sigue reservado a quienes administran la clínica.
      qrDataUrl: summaryOnly ? null : payload.qrDataUrl ?? null,
      updatedAt: payload.updatedAt ?? null,
    });
  } catch {
    return NextResponse.json({ status: "UNAVAILABLE" }, { status: 503 });
  }
}
