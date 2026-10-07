import Link from "next/link";
import { BarChart3, CalendarCheck, UserPlus, UserX, UsersRound } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getClinicReport, INACTIVE_AFTER_MONTHS, REPORT_PERIODS, type ReportPeriod } from "@/lib/queries/reports";
import { medicalRecordTypeLabel } from "@/lib/format";

const PERIOD_LABELS: Record<ReportPeriod, string> = { 30: "Últimos 30 días", 90: "Últimos 90 días", 365: "Último año" };

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** Barra horizontal proporcional al mayor valor de su grupo. */
function Bar({ label, value, max, hint }: { label: string; value: number; max: number; hint?: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  return (
    <li>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium text-slate-700">{label}</span>
        <span className="shrink-0 text-slate-500">
          <span className="font-semibold text-slate-900">{value}</span>
          {hint ? ` · ${hint}` : ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${width}%` }} />
      </div>
    </li>
  );
}

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const session = await requireSession();
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) {
    return (
      <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="mt-3 max-w-xl rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Los reportes de gestión solo están disponibles para quienes administran la clínica.
        </p>
      </section>
    );
  }

  const { periodo } = await searchParams;
  const period = REPORT_PERIODS.find((value) => String(value) === periodo) ?? 30;
  const clinic = await getClinicSettings(session.clinicId);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const report = await getClinicReport(session.clinicId, timezone, period);

  const stats = [
    { label: "Turnos en el período", value: String(report.totalAppointments), hint: `Atendidos: ${report.attended} · Cancelados: ${report.cancelled}`, icon: CalendarCheck, tone: "text-blue-600 bg-blue-50" },
    {
      label: "Ausentismo",
      value: report.noShowRate === null ? "—" : percent(report.noShowRate),
      hint: report.noShowRate === null ? "Todavía no hay turnos concluidos" : `Ausentes: ${report.noShow} de ${report.attended + report.noShow} turnos concluidos`,
      icon: UserX,
      tone: "text-rose-600 bg-rose-50",
    },
    { label: "Clientes nuevos", value: String(report.newClients), hint: `${report.totalClients} en total`, icon: UserPlus, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Clientes inactivos", value: String(report.inactiveCount), hint: `Sin visitas hace más de ${INACTIVE_AFTER_MONTHS} meses`, icon: UsersRound, tone: "text-amber-600 bg-amber-50" },
  ];

  const origins = [
    { label: "Bot de WhatsApp", value: report.bookedByWhatsapp },
    { label: "Reserva online", value: report.bookedOnline },
    { label: "Cargados en el panel", value: report.bookedByCrm },
  ];
  const maxOrigin = Math.max(...origins.map((origin) => origin.value));
  const maxVet = Math.max(0, ...report.veterinarians.map((vet) => vet.total));
  const maxRecord = Math.max(0, ...report.recordsByType.map((row) => row.count));

  return (
    <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
            <BarChart3 size={16} />
            Gestión
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reportes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Cómo viene la clínica: turnos, ausentismo, de dónde llegan las reservas y qué clientes conviene volver a contactar.</p>
        </div>
        <nav aria-label="Período" className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {REPORT_PERIODS.map((value) => (
            <Link
              key={value}
              href={`/reportes?periodo=${value}`}
              aria-current={value === period ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${value === period ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {PERIOD_LABELS[value]}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`grid size-10 place-items-center rounded-xl ${stat.tone}`}>
              <stat.icon size={19} />
            </span>
            <p className="mt-4 text-3xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-sm font-medium text-slate-700">{stat.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <h2 className="font-semibold">Turnos por veterinario</h2>
          <p className="mt-1 text-sm text-slate-500">Turnos con fecha dentro del período.</p>
          {report.veterinarians.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">No hubo turnos en este período.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {report.veterinarians.map((vet) => (
                <Bar key={vet.name} label={vet.name} value={vet.total} max={maxVet} hint={`atendidos: ${vet.attended} · ausentes: ${vet.noShow}`} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <h2 className="font-semibold">De dónde llegan los turnos</h2>
          <p className="mt-1 text-sm text-slate-500">Turnos creados en el período, según quién los cargó.</p>
          <ul className="mt-5 space-y-4">
            {origins.map((origin) => (
              <Bar key={origin.label} label={origin.label} value={origin.value} max={maxOrigin} />
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <h2 className="font-semibold">Atenciones registradas</h2>
          <p className="mt-1 text-sm text-slate-500">Por tipo, según la historia clínica.</p>
          {report.recordsByType.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">No se registraron atenciones en este período.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {report.recordsByType.map((row) => (
                <Bar key={row.type} label={medicalRecordTypeLabel(row.type)} value={row.count} max={maxRecord} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <h2 className="font-semibold">Clientes para volver a contactar</h2>
          <p className="mt-1 text-sm text-slate-500">Sin turnos ni atenciones hace más de {INACTIVE_AFTER_MONTHS} meses.</p>
          {report.inactiveClients.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">No hay clientes inactivos.</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-slate-100">
                {report.inactiveClients.map((client) => (
                  <li key={client.id}>
                    <Link href={`/clientes?q=${encodeURIComponent(client.phone)}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-emerald-700">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{client.name}</span>
                        <span className="block truncate text-xs text-slate-500">{client.pets.join(", ")}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{client.phone}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {report.inactiveCount > report.inactiveClients.length && (
                <p className="mt-3 text-xs text-slate-400">Y {report.inactiveCount - report.inactiveClients.length} más.</p>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
