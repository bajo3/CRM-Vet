import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Meta redirige acá después del Embedded Signup, vía Zernio, con
// ?connected=whatsapp&profileId=...&accountId=...&username=... (accountId falta si el usuario
// canceló o hubo un error del lado de Meta/Zernio).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const profileId = params.get("profileId");
  const accountId = params.get("accountId");
  const settingsUrl = new URL("/configuracion", request.nextUrl.origin);

  if (!profileId) {
    settingsUrl.searchParams.set("whatsapp", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  // Mismo permiso que para iniciar la conexión: solo quien administra la clínica puede cambiar su canal.
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) {
    settingsUrl.searchParams.set("whatsapp", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({
    where: { id: session.clinicId },
    select: { id: true, zernioProfileId: true },
  });

  // El profile del callback debe pertenecer a la clínica de la sesión actual; si no coincide, no
  // tocamos nada (podría ser un callback viejo, de otra pestaña, o un profileId manipulado).
  if (!clinic || clinic.zernioProfileId !== profileId) {
    settingsUrl.searchParams.set("whatsapp", "mismatch");
    return NextResponse.redirect(settingsUrl);
  }

  if (!accountId) {
    // El usuario canceló el Embedded Signup o Meta lo rechazó; el profile queda creado para
    // reintentar, pero no hay cuenta que guardar.
    settingsUrl.searchParams.set("whatsapp", "cancelled");
    return NextResponse.redirect(settingsUrl);
  }

  await prisma.clinic.update({ where: { id: clinic.id }, data: { zernioAccountId: accountId } });
  settingsUrl.searchParams.set("whatsapp", "connected");
  return NextResponse.redirect(settingsUrl);
}
