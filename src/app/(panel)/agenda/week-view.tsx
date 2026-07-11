import Link from "next/link";
import { DateTime } from "luxon";
import { Plus } from "lucide-react";
import { appointmentStatusBadge, formatTime } from "@/lib/format";
import type { AgendaAppointment } from "@/lib/queries/agenda";

/** Primer nombre "distintivo" de un veterinario, saltando prefijos como "Dr."/"Dra." que no diferencian entre sí. */
function shortVetName(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  const meaningful = parts.find((part) => !/^dr\.?a?\.?$/i.test(part)) ?? parts[0];
  return meaningful ?? name;
}

export function WeekView({
  weekDates,
  timezone,
  appointments,
  showVet,
  vetId,
  canCreate,
}: {
  weekDates: string[];
  timezone: string;
  appointments: AgendaAppointment[];
  showVet: boolean;
  vetId?: string;
  canCreate: boolean;
}) {
  const now = new Date();
  const byDate = new Map<string, AgendaAppointment[]>();
  for (const date of weekDates) byDate.set(date, []);
  for (const appointment of appointments) {
    const key = DateTime.fromJSDate(appointment.startAt).setZone(timezone).toFormat("yyyy-MM-dd");
    byDate.get(key)?.push(appointment);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-w-[980px] grid-cols-7">
        {weekDates.map((date) => {
          const dt = DateTime.fromISO(date, { zone: timezone }).setLocale("es");
          const isToday = dt.hasSame(DateTime.now().setZone(timezone), "day");
          const dayAppointments = byDate.get(date) ?? [];

          return (
            <div key={date} className="flex flex-col border-r border-slate-100 last:border-r-0">
              <div className={`border-b border-slate-100 p-3 text-center ${isToday ? "bg-emerald-50" : ""}`}>
                <div className="text-xs font-medium uppercase text-slate-400">{dt.toFormat("ccc")}</div>
                <div className={`text-lg font-semibold ${isToday ? "text-emerald-700" : "text-slate-800"}`}>{dt.toFormat("d")}</div>
              </div>
              <div className="flex-1 space-y-1.5 p-2">
                {dayAppointments.length === 0 ? (
                  <p className="p-2 text-center text-[11px] text-slate-300">Sin turnos</p>
                ) : (
                  dayAppointments.map((appointment) => {
                    const badge = appointmentStatusBadge(appointment.status);
                    const past = appointment.startAt < now;
                    return (
                      <Link
                        key={appointment.id}
                        href={`/agenda/${appointment.id}`}
                        className={`block rounded-lg px-2 py-1.5 text-[11px] transition-opacity hover:opacity-90 ${badge.className} ${past ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-1 font-mono font-semibold">
                          <span>{formatTime(appointment.startAt, timezone)}</span>
                          {showVet && <span className="truncate text-[10px] font-normal">{shortVetName(appointment.veterinarian.name)}</span>}
                        </div>
                        <div className="truncate font-medium">{appointment.pet.name}</div>
                      </Link>
                    );
                  })
                )}
              </div>
              {canCreate && (
                <Link
                  href={`/agenda/nuevo?date=${date}${vetId ? `&vetId=${vetId}` : ""}`}
                  className="flex items-center justify-center gap-1 border-t border-slate-100 p-2 text-[11px] font-medium text-emerald-600 hover:bg-emerald-50"
                >
                  <Plus size={12} />
                  Nuevo
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
