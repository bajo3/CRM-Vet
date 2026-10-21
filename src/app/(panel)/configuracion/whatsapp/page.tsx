import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/queries/clinic";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { WhatsappConnectionCard } from "../whatsapp-connection-card";
import { ZernioWhatsappCard } from "../zernio-whatsapp-card";

export default async function ConfiguracionWhatsappPage({ searchParams }: { searchParams: Promise<{ whatsapp?: string }> }) {
  const session = await requireSession();
  if (!CLINIC_CONFIG_ROLES.includes(session.role)) redirect("/configuracion");
  const [{ whatsapp: result }, clinic] = await Promise.all([searchParams, getClinicSettings(session.clinicId)]);
  if (!clinic) notFound();

  // Conectada: estado del número. Sin conectar: el asistente de conexión (autoservicio).
  return (
    <div className="space-y-6">
      {clinic.zernioAccountId && <WhatsappConnectionCard />}
      <ZernioWhatsappCard connected={!!clinic.zernioAccountId} result={result} />
    </div>
  );
}
