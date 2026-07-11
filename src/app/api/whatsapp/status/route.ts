import { NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || !hasRole(session, CLINIC_CONFIG_ROLES)) {
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
      qrDataUrl: payload.qrDataUrl ?? null,
      updatedAt: payload.updatedAt ?? null,
    });
  } catch {
    return NextResponse.json({ status: "UNAVAILABLE" }, { status: 503 });
  }
}
