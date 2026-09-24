import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";
import { getZernioNumberInfo, type ZernioNumberInfo } from "@/lib/whatsapp/zernio-client";

export const dynamic = "force-dynamic";

// La tarjeta de Configuración y el banner del panel consultan esto cada pocos segundos; el estado
// del número en Meta cambia muy rara vez, así que no hace falta preguntarle a Zernio cada vez.
const ZERNIO_INFO_TTL_MS = 60_000;
const zernioInfoCache = new Map<string, { at: number; info: ZernioNumberInfo | null }>();

async function cachedZernioInfo(accountId: string) {
  const hit = zernioInfoCache.get(accountId);
  if (hit && Date.now() - hit.at < ZERNIO_INFO_TTL_MS) return hit.info;
  const info = await getZernioNumberInfo(accountId);
  zernioInfoCache.set(accountId, { at: Date.now(), info });
  return info;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
  if (!session || (!summaryOnly && !hasRole(session, CLINIC_CONFIG_ROLES))) {
    return NextResponse.json({ status: "UNAVAILABLE" }, { status: 403 });
  }

  const clinic = session.clinicId
    ? await getPrisma().clinic.findUnique({
        where: { id: session.clinicId },
        select: { whatsappBridgeUrl: true, zernioAccountId: true },
      })
    : null;

  // Clínicas con WhatsApp oficial (Cloud API de Meta vía Zernio): no hay QR ni bridge propio.
  if (clinic?.zernioAccountId) {
    const info = await cachedZernioInfo(clinic.zernioAccountId);
    // Si Zernio no responde no marcamos el canal como caído: los envíos se reintentan solos.
    const disconnected = info?.status && info.status !== "CONNECTED";
    return NextResponse.json({
      channel: "zernio",
      status: disconnected ? "UNAVAILABLE" : "CONNECTED",
      phoneNumber: info?.phoneNumber ?? null,
      displayName: info?.verifiedName ?? null,
      qrDataUrl: null,
      updatedAt: new Date().toISOString(),
    });
  }

  // Cada clínica puede tener su propio bridge de Railway (un número de WhatsApp por clínica). Si
  // todavía no tiene uno asignado, cae al bridge global (usado hoy por la clínica demo y durante
  // la transición mientras se provisionan bridges dedicados para el resto).
  const bridgeUrl = clinic?.whatsappBridgeUrl || process.env.WHATSAPP_BRIDGE_URL;
  const internalToken = process.env.INTERNAL_WHATSAPP_TOKEN;
  if (!bridgeUrl || !internalToken) {
    return NextResponse.json({ channel: "baileys", status: "NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/status`, {
      headers: { "x-internal-token": internalToken },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("BRIDGE_UNAVAILABLE");
    const payload = (await response.json()) as { status?: string; qrDataUrl?: string | null; updatedAt?: string; phoneNumber?: string | null };
    return NextResponse.json({
      channel: "baileys",
      status: payload.status ?? "UNAVAILABLE",
      // El resumen de la bandeja está disponible para cualquier miembro autenticado, pero el QR
      // de vinculación sigue reservado a quienes administran la clínica.
      qrDataUrl: summaryOnly ? null : payload.qrDataUrl ?? null,
      phoneNumber: payload.status === "CONNECTED" ? payload.phoneNumber ?? null : null,
      updatedAt: payload.updatedAt ?? null,
    });
  } catch {
    return NextResponse.json({ channel: "baileys", status: "UNAVAILABLE" }, { status: 503 });
  }
}
