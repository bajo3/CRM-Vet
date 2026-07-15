import Link from "next/link";
import { BellOff, BellRing, CalendarClock, History, Search, Settings } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listClinicReminders, type ClinicReminder } from "@/lib/queries/reminders";
import { getClinicSettings } from "@/lib/queries/clinic";
import { formatDateTime, reminderStatusBadge, reminderTypeLabel } from "@/lib/format";

function ReminderRow({ reminder, timezone, showStatus }: { reminder: ClinicReminder; timezone: string; showStatus: boolean }) {
  const badge = reminderStatusBadge(reminder.status);
  return (
    <li>
      <Link
        href={`/clientes/mascotas/${reminder.petId}`}
        className="flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:bg-emerald-50/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{reminderTypeLabel(reminder.type)}</span>
            {showStatus && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>}
            {!showStatus && !reminder.clientRemindersEnabled && (
              <span title="El cliente tiene los recordatorios desactivados: este mensaje no se va a enviar." className="flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                <BellOff size={12} />
                Pausado por cliente
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-slate-700">
            {reminder.petName} · {reminder.clientName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {reminder.status === "SENT" && reminder.sentAt
              ? `Enviado el ${formatDateTime(reminder.sentAt, timezone)}`
              : `${reminder.status === "PENDING" ? "Se envía el" : "Estaba programado para el"} ${formatDateTime(reminder.scheduledAt, timezone)}`}
            {" · WhatsApp a "}
            {reminder.clientPhone}
          </p>
          {reminder.status === "FAILED" && reminder.errorMessage && (
            <p className="mt-1 text-xs text-rose-600">No se pudo enviar: {reminder.errorMessage}</p>
          )}
        </div>
      </Link>
    </li>
  );
}

export default async function RecordatoriosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession();
  const { q = "" } = await searchParams;
  const [{ upcoming, history }, clinic] = await Promise.all([listClinicReminders(session.clinicId, q), getClinicSettings(session.clinicId)]);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";

  return (
    <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recordatorios</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Los mensajes de WhatsApp que la clínica envía sola a tus clientes: avisos de próximos controles y de turnos. Acá ves qué está
            programado y qué ya se envió.
          </p>
        </div>
        <Link
          href="/configuracion"
          className="flex h-10 w-fit shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <Settings size={16} />
          Configurar reglas
        </Link>
      </header>

      <form className="mb-6 flex h-12 max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <Search size={18} className="text-slate-400" />
        <input
          name="q"
          defaultValue={q}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Buscar por cliente o mascota"
        />
      </form>

      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 p-5">
            <CalendarClock size={18} className="text-emerald-600" />
            <h2 className="font-semibold">Próximos envíos</h2>
            {upcoming.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">{upcoming.length}</span>
            )}
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <BellRing size={28} className="text-slate-300" />
              <p className="font-medium text-slate-700">{q ? "No encontramos envíos programados con esa búsqueda." : "No hay envíos programados por ahora."}</p>
              {!q && (
                <p className="max-w-md text-sm text-slate-500">
                  Se programan solos: al registrar una visita con próximo control, o al agendar un turno. Definí cada cuánto en{" "}
                  <Link href="/configuracion" className="font-medium text-emerald-700 hover:underline">
                    Configuración
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : (
            <ol className="divide-y divide-slate-100">
              {upcoming.map((reminder) => (
                <ReminderRow key={reminder.id} reminder={reminder} timezone={timezone} showStatus={false} />
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 p-5">
            <History size={18} className="text-emerald-600" />
            <h2 className="font-semibold">Historial</h2>
          </div>
          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <History size={28} className="text-slate-300" />
              <p className="text-sm text-slate-500">{q ? "No encontramos envíos anteriores con esa búsqueda." : "Todavía no se envió ningún recordatorio."}</p>
            </div>
          ) : (
            <ol className="divide-y divide-slate-100">
              {history.map((reminder) => (
                <ReminderRow key={reminder.id} reminder={reminder} timezone={timezone} showStatus={true} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
