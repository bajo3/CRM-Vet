import { Fragment } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { PlusCircle } from "lucide-react";
import { appointmentStatusBadge, formatTime } from "@/lib/format";
import type { AgendaAppointment } from "@/lib/queries/agenda";

type Vet = { id: string; name: string };

function AppointmentCard({ appointment, timezone }: { appointment: AgendaAppointment; timezone: string }) {
  const badge = appointmentStatusBadge(appointment.status);
  return (
    <Link
      href={`/agenda/${appointment.id}`}
      className={`flex h-[74px] flex-col justify-center gap-0.5 rounded-xl px-3 py-1.5 text-xs shadow-sm transition-opacity hover:opacity-90 ${badge.className}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono font-semibold">{formatTime(appointment.startAt, timezone)}</span>
        <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-medium">{badge.label}</span>
      </div>
      <div className="truncate font-medium">{appointment.pet.name}</div>
      <div className="truncate text-[11px] opacity-80">{appointment.pet.client.name}</div>
    </Link>
  );
}

export function DayView({
  date,
  timezone,
  slots,
  vets,
  appointments,
  canCreate,
}: {
  date: string;
  timezone: string;
  slots: string[];
  vets: Vet[];
  appointments: AgendaAppointment[];
  canCreate: boolean;
}) {
  const now = new Date();

  if (vets.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        No hay veterinarios activos en esta clínica.
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        La clínica no abre este día. Elegí otra fecha o creá un turno igual desde &quot;Nuevo turno&quot;.
      </div>
    );
  }

  function appointmentAt(vetId: string, slot: string) {
    return appointments.find(
      (appointment) => appointment.veterinarianId === vetId && DateTime.fromJSDate(appointment.startAt).setZone(timezone).toFormat("HH:mm") === slot
    );
  }

  function slotIsPast(slot: string) {
    return DateTime.fromISO(`${date}T${slot}`, { zone: timezone }).toJSDate() < now;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-w-[560px]" style={{ gridTemplateColumns: `76px repeat(${vets.length}, minmax(200px, 1fr))` }}>
        <div className="sticky left-0 z-10 border-b border-r border-slate-100 bg-slate-50 p-3 text-xs font-medium text-slate-500">Hora</div>
        {vets.map((vet) => (
          <div key={vet.id} className="truncate border-b border-slate-100 p-3 text-sm font-semibold">
            {vet.name}
          </div>
        ))}

        {slots.map((slot) => {
          const past = slotIsPast(slot);
          return (
            <Fragment key={slot}>
              <div
                className={`sticky left-0 z-10 border-b border-r border-slate-100 bg-white p-3 font-mono text-xs ${past ? "text-slate-300" : "text-slate-500"}`}
              >
                {slot}
              </div>
              {vets.map((vet) => {
                const appointment = appointmentAt(vet.id, slot);
                return (
                  <div key={`${vet.id}-${slot}`} className={`border-b border-slate-100 p-1.5 ${past && !appointment ? "opacity-40" : ""}`}>
                    {appointment ? (
                      <AppointmentCard appointment={appointment} timezone={timezone} />
                    ) : past || !canCreate ? (
                      <div className="h-[74px]" />
                    ) : (
                      <Link
                        href={`/agenda/nuevo?date=${date}&time=${slot}&vetId=${vet.id}`}
                        className="flex h-[74px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-300 transition-colors hover:border-emerald-300 hover:text-emerald-500"
                      >
                        <PlusCircle size={18} />
                      </Link>
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
