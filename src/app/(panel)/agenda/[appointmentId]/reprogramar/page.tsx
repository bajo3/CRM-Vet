import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DateTime } from "luxon";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { AGENDA_MANAGE_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getAppointmentDetail } from "@/lib/queries/agenda";
import { formatDateTime } from "@/lib/format";
import { RescheduleForm } from "./reschedule-form";

export default async function ReprogramarTurnoPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const session = await requireRole(AGENDA_MANAGE_ROLES, `/agenda/${appointmentId}`);

  const [detail, clinic] = await Promise.all([
    getAppointmentDetail(session.clinicId, appointmentId),
    getClinicSettings(session.clinicId),
  ]);
  if (!detail) notFound();
  const { appointment } = detail;

  if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
    redirect(`/agenda/${appointmentId}`);
  }

  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";

  return (
    <section className="mx-auto max-w-2xl px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <Link href={`/agenda/${appointmentId}`} className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} />
        Volver al turno
      </Link>

      <h1 className="mb-1 text-xl font-semibold">Reprogramar turno</h1>
      <p className="mb-6 text-sm text-slate-500">
        {appointment.pet.name} con {appointment.veterinarian.name} · Actualmente: {formatDateTime(appointment.startAt, timezone)}
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <RescheduleForm
          appointmentId={appointmentId}
          veterinarianId={appointment.veterinarianId}
          defaultDate={DateTime.fromJSDate(appointment.startAt).setZone(timezone).toFormat("yyyy-MM-dd")}
        />
      </div>
    </section>
  );
}
