import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/queries/clinic";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { OnlineBookingCard } from "../online-booking-card";

export default async function ConfiguracionReservaOnlinePage() {
  const session = await requireSession();
  if (!CLINIC_CONFIG_ROLES.includes(session.role)) redirect("/configuracion");
  const [clinic, requestHeaders] = await Promise.all([getClinicSettings(session.clinicId), headers()]);
  if (!clinic) notFound();
  const appUrl = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  return <OnlineBookingCard initialSlug={clinic.bookingSlug} appUrl={appUrl} />;
}
