import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";
import { ensureZernioProfile, getWhatsappConnectUrl } from "@/lib/whatsapp/zernio-client";

export const dynamic = "force-dynamic";

// Inicia el Embedded Signup de Meta para vincular WhatsApp (coexistencia) vía Zernio, sin salir
// del dominio del CRM. Enlazado desde un <a> en Configuración; devuelve un redirect, no JSON.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !hasRole(session, CLINIC_CONFIG_ROLES)) {
    return NextResponse.json({ error: "No tenés permisos para conectar WhatsApp." }, { status: 403 });
  }

  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({
    where: { id: session.clinicId },
    select: { id: true, name: true, zernioProfileId: true },
  });
  if (!clinic) return NextResponse.json({ error: "Clínica no encontrada." }, { status: 404 });

  try {
    let profileId = clinic.zernioProfileId;
    if (!profileId) {
      profileId = await ensureZernioProfile(clinic.name, clinic.id);
      await prisma.clinic.update({ where: { id: clinic.id }, data: { zernioProfileId: profileId } });
    }

    const redirectUrl = new URL("/api/whatsapp/zernio/callback", request.nextUrl.origin).toString();
    const authUrl = await getWhatsappConnectUrl(profileId, redirectUrl);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "ZERNIO_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Falta configurar ZERNIO_API_KEY en el servidor." }, { status: 503 });
    }
    return NextResponse.json({ error: "No se pudo iniciar la conexión con Zernio.", code }, { status: 502 });
  }
}
