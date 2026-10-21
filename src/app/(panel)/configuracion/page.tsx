import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/queries/clinic";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { ClinicForm } from "./clinic-form";

export default async function ConfiguracionClinicaPage() {
  const session = await requireSession();
  const clinic = await getClinicSettings(session.clinicId);
  if (!clinic) notFound();

  return (
    <ClinicForm
      clinic={{
        name: clinic.name,
        phone: clinic.phone ?? "",
        timezone: clinic.timezone,
        duration: clinic.defaultAppointmentDuration,
        openingHours: clinic.openingHours,
        logoUrl: clinic.logoUrl,
      }}
      editable={CLINIC_CONFIG_ROLES.includes(session.role)}
    />
  );
}
