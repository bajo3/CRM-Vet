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
    ? await getPrisma().clinic.findUnique({ where: { id: session.clinicId }, select: { zernioAccountId: true } })
    : null;

  // Todavía no conectó el WhatsApp oficial (típico: clínica recién registrada).
  if (!clinic?.zernioAccountId) {
    return NextResponse.json({ channel: "none", status: "NOT_CONFIGURED" });
  }

  const info = await cachedZernioInfo(clinic.zernioAccountId);
  // Si Zernio no responde no marcamos el canal como caído: los envíos se reintentan solos.
  const disconnected = info?.status && info.status !== "CONNECTED";
  return NextResponse.json({
    channel: "zernio",
    status: disconnected ? "UNAVAILABLE" : "CONNECTED",
    phoneNumber: info?.phoneNumber ?? null,
    displayName: info?.verifiedName ?? null,
    updatedAt: new Date().toISOString(),
  });
}
