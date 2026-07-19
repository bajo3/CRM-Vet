import Link from "next/link";
import { ArrowLeft, BellOff, CalendarClock, History, MessageCircle, Search } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listClientsForScheduling } from "@/lib/queries/clients";
import { listScheduledMessages, type ClinicScheduledMessage } from "@/lib/queries/scheduled-messages";
import { getClinicSettings } from "@/lib/queries/clinic";
import { formatDateTime, scheduledMessageStatusBadge } from "@/lib/format";
import { ScheduleMessageForm } from "./schedule-message-form";
import { CancelScheduledMessageButton } from "./cancel-scheduled-message-button";

function ScheduledMessageRow({ message, timezone }: { message: ClinicScheduledMessage; timezone: string }) {
  const badge = scheduledMessageStatusBadge(message.status);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
          {!message.clientRemindersEnabled && (
            <span title="El cliente tiene los recordatorios desactivados." className="flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
              <BellOff size={12} />
              Recordatorios off
            </span>
          )}
        </div>
        <p className="mt-1.5 truncate text-sm font-medium text-slate-700">{message.clientName}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{message.content}</p>
        <p className="mt-1.5 text-xs text-slate-500">
          {message.status === "SENT" && message.sentAt
            ? `Enviado el ${formatDateTime(message.sentAt, timezone)}`
            : `${message.status === "PENDING" ? "Se envía el" : "Estaba programado para el"} ${formatDateTime(message.scheduledAt, timezone)}`}
          {" · Programado por "}
          {message.userName}
        </p>
        {message.status === "FAILED" && message.errorMessage && <p className="mt-1 text-xs text-rose-600">No se pudo enviar: {message.errorMessage}</p>}
      </div>
      {message.status === "PENDING" && <CancelScheduledMessageButton id={message.id} />}
    </li>
  );
}

export default async function MensajesProgramadosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession();
  const { q = "" } = await searchParams;
  const [clients, { upcoming, history }, clinic] = await Promise.all([
    listClientsForScheduling(session.clinicId),
    listScheduledMessages(session.clinicId, q),
    getClinicSettings(session.clinicId),
  ]);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";

  return (
    <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/mensajes" aria-label="Volver a conversaciones" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
              <ArrowLeft size={16} />
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">Mensajes</p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mensajes programados</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Escribí un mensaje de WhatsApp libre y programalo para el día y horario que quieras. No tiene nada que ver con los{" "}
            <Link href="/recordatorios" className="font-medium text-emerald-700 hover:underline">
              recordatorios automáticos
            </Link>
            .
          </p>
        </div>
        <Link
          href="/mensajes"
          className="flex h-10 w-fit shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <MessageCircle size={16} />
          Ir a conversaciones
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <ScheduleMessageForm clients={clients} />

        <div className="space-y-6">
          <form className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
            <Search size={18} className="text-slate-400" />
            <input name="q" defaultValue={q} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Buscar por cliente" />
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 p-5">
              <CalendarClock size={18} className="text-emerald-600" />
              <h2 className="font-semibold">Próximos envíos</h2>
              {upcoming.length > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">{upcoming.length}</span>}
            </div>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-10 text-center">
                <CalendarClock size={28} className="text-slate-300" />
                <p className="font-medium text-slate-700">{q ? "No encontramos envíos programados con esa búsqueda." : "Todavía no programaste ningún mensaje."}</p>
              </div>
            ) : (
              <ol className="divide-y divide-slate-100">
                {upcoming.map((message) => (
                  <ScheduledMessageRow key={message.id} message={message} timezone={timezone} />
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
                <p className="text-sm text-slate-500">{q ? "No encontramos envíos anteriores con esa búsqueda." : "Todavía no se envió ningún mensaje programado."}</p>
              </div>
            ) : (
              <ol className="divide-y divide-slate-100">
                {history.map((message) => (
                  <ScheduledMessageRow key={message.id} message={message} timezone={timezone} />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
