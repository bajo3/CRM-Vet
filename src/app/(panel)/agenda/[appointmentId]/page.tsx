import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock3, PawPrint, Phone, Stethoscope, User } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { requireSession, hasRole } from "@/lib/auth/session";
import { AGENDA_MANAGE_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";
import { getAppointmentDetail } from "@/lib/queries/agenda";
import { appointmentStatusBadge, describeAppointmentActivity, formatDateTime } from "@/lib/format";
import { updateAppointmentStatusFormAction } from "@/lib/actions/appointments";

type SearchParams = { ok?: string; confirm?: string };

const NEXT_STATUS: Record<AppointmentStatus, { status: AppointmentStatus; label: string; tone: string }[]> = {
  PENDING: [
    { status: "CONFIRMED", label: "Confirmar", tone: "bg-emerald-600 text-white shadow-emerald-200" },
    { status: "ATTENDED", label: "Marcar atendido", tone: "bg-blue-600 text-white shadow-blue-200" },
    { status: "NO_SHOW", label: "Marcar ausente", tone: "bg-rose-500 text-white shadow-rose-200" },
  ],
  CONFIRMED: [
    { status: "ATTENDED", label: "Marcar atendido", tone: "bg-blue-600 text-white shadow-blue-200" },
    { status: "NO_SHOW", label: "Marcar ausente", tone: "bg-rose-500 text-white shadow-rose-200" },
  ],
  ATTENDED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  const { appointmentId } = await params;
  const { ok, confirm } = await searchParams;

  const detail = await getAppointmentDetail(session.clinicId, appointmentId);
  if (!detail) notFound();
  const { appointment, activities } = detail;

  const clinic = await getPrisma().clinic.findUnique({ where: { id: session.clinicId } });
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";

  const isManager = hasRole(session, AGENDA_MANAGE_ROLES);
  const isOwnVet = session.role === "VETERINARIAN" && appointment.veterinarianId === session.userId;
  const canChangeStatus = isManager || isOwnVet;
  const canCancelOrReschedule = isManager;

  const badge = appointmentStatusBadge(appointment.status);
  const statusOptions = NEXT_STATUS[appointment.status] ?? [];
  const canBeCancelled = canCancelOrReschedule && (appointment.status === "PENDING" || appointment.status === "CONFIRMED");
  const canBeRescheduled = canBeCancelled;

  return (
    <section className="mx-auto max-w-3xl px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <Link href="/agenda" className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} />
        Agenda
      </Link>

      {ok && <div className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{ok}</div>}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className={`mb-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
            <h1 className="text-xl font-semibold">{formatDateTime(appointment.startAt, timezone)}</h1>
            <p className="mt-1 text-sm text-slate-500">{appointment.reason}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <div className="flex items-start gap-2.5">
            <PawPrint size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <div className="font-medium">{appointment.pet.name}</div>
              <Link href={`/clientes/mascotas/${appointment.pet.id}`} className="text-xs font-medium text-emerald-700 hover:underline">
                Ver ficha
              </Link>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <User size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <div className="font-medium">{appointment.pet.client.name}</div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Phone size={11} />
                {appointment.pet.client.phone}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Stethoscope size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <div className="font-medium">{appointment.veterinarian.name}</div>
              <div className="text-xs text-slate-500">Veterinario/a</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Clock3 size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <div className="font-medium">{appointment.createdBy?.name ?? "Agendado por WhatsApp"}</div>
              <div className="text-xs text-slate-500">{appointment.source === "WHATSAPP" ? "Origen: WhatsApp" : "Origen: CRM"}</div>
            </div>
          </div>
        </div>

        {confirm === "cancelar" && canBeCancelled ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="mb-3 text-sm font-medium text-rose-800">¿Seguro que querés cancelar este turno? Esta acción libera el horario.</p>
            <div className="flex gap-2">
              <form action={updateAppointmentStatusFormAction.bind(null, appointment.id, "CANCELLED")}>
                <button type="submit" className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-medium text-white">
                  Sí, cancelar turno
                </button>
              </form>
              <Link
                href={`/agenda/${appointment.id}`}
                className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600"
              >
                Volver
              </Link>
            </div>
          </div>
        ) : (
          (canChangeStatus && statusOptions.length > 0) || canBeCancelled || canBeRescheduled ? (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
              {canChangeStatus &&
                statusOptions.map((option) => (
                  <form key={option.status} action={updateAppointmentStatusFormAction.bind(null, appointment.id, option.status)}>
                    <button type="submit" className={`h-10 rounded-xl px-4 text-sm font-medium shadow-sm ${option.tone}`}>
                      {option.label}
                    </button>
                  </form>
                ))}
              {canBeRescheduled && (
                <Link
                  href={`/agenda/${appointment.id}/reprogramar`}
                  className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Reprogramar
                </Link>
              )}
              {canBeCancelled && (
                <Link
                  href={`/agenda/${appointment.id}?confirm=cancelar`}
                  className="flex h-10 items-center rounded-xl border border-rose-200 px-4 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Cancelar turno
                </Link>
              )}
            </div>
          ) : null
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold">Historial de actividad</h2>
        </div>
        {activities.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Sin actividad registrada.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {activities.map((activity) => (
              <li key={activity.id} className="p-4 text-sm">
                <p className="text-slate-700">{describeAppointmentActivity(activity.action, activity.details, timezone)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {activity.user?.name ?? "Sistema"} · {formatDateTime(activity.createdAt, timezone)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
