import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarDays, ChevronRight, Clock3, MessageCircle, PawPrint, Plus, Search } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { AGENDA_MANAGE_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";
import { getDashboardData } from "@/lib/queries/dashboard";
import { appointmentStatusBadge, capitalize, formatTime } from "@/lib/format";

function greeting(hour: number) {
  if (hour < 12) return "Buen día";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default async function InicioPage() {
  const session = await requireSession();
  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({ where: { id: session.clinicId } });
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";

  const { todayAppointments, pendingTodayCount, upcomingControlsCount, overdueControlsCount, requiresHumanConversations } = await getDashboardData(
    session.clinicId,
    timezone
  );

  const now = DateTime.now().setZone(timezone).setLocale("es");
  const firstName = session.name.split(" ")[0];

  const stats = [
    { label: "Turnos de hoy", value: todayAppointments.length, hint: `${pendingTodayCount} por confirmar`, icon: CalendarDays, tone: "text-blue-600 bg-blue-50" },
    { label: "Sin confirmar", value: pendingTodayCount, hint: "Revisar ahora", icon: Clock3, tone: "text-amber-600 bg-amber-50" },
    { label: "Próximos controles", value: upcomingControlsCount, hint: "Próximos 7 días", icon: PawPrint, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Controles vencidos", value: overdueControlsCount, hint: "Sin turno agendado", icon: Clock3, tone: "text-rose-600 bg-rose-50" },
  ];

  return (
    <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-sm text-slate-500">{capitalize(now.toFormat("cccc d 'de' LLLL"))}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting(now.hour)}, {firstName}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/clientes/mascotas/nueva"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm"
          >
            <PawPrint size={17} />
            Nueva mascota
          </Link>
          <Link
            href={hasRole(session, AGENDA_MANAGE_ROLES) ? "/agenda/nuevo" : "/agenda"}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm shadow-emerald-200"
          >
            <Plus size={17} />
            {hasRole(session, AGENDA_MANAGE_ROLES) ? "Nuevo turno" : "Ver agenda"}
          </Link>
        </div>
      </header>

      <form action="/clientes" className="mb-7 flex h-12 max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <Search size={18} className="text-slate-400" />
        <input name="q" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Buscar cliente, mascota o teléfono" />
      </form>

      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`mb-5 grid size-10 place-items-center rounded-xl ${item.tone}`}>
              <item.icon size={20} />
            </div>
            <div className="text-3xl font-semibold">{item.value}</div>
            <div className="mt-1 text-sm font-medium">{item.label}</div>
            <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div>
              <h2 className="font-semibold">Turnos de hoy</h2>
              <p className="mt-1 text-xs text-slate-500">Agenda del día</p>
            </div>
            <Link href="/agenda" className="text-sm font-medium text-emerald-700">
              Ver agenda
            </Link>
          </div>
          {todayAppointments.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No hay turnos agendados para hoy.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayAppointments.map((appointment) => {
                const badge = appointmentStatusBadge(appointment.status);
                return (
                  <Link
                    key={appointment.id}
                    href={`/agenda/${appointment.id}`}
                    className="grid grid-cols-[54px_1fr_auto] items-center gap-3 p-4 hover:bg-slate-50 sm:grid-cols-[70px_1fr_120px_auto]"
                  >
                    <span className="font-mono text-sm font-medium">{formatTime(appointment.startAt, timezone)}</span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{appointment.pet.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {appointment.pet.client.name} · {appointment.reason}
                      </div>
                    </div>
                    <span className={`hidden w-fit rounded-full px-2.5 py-1 text-xs font-medium sm:block ${badge.className}`}>{badge.label}</span>
                    <ChevronRight size={17} className="text-slate-400" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Requieren atención</h2>
              <p className="mt-1 text-xs text-slate-500">Derivados desde WhatsApp</p>
            </div>
            {requiresHumanConversations.length > 0 && (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">{requiresHumanConversations.length} nuevos</span>
            )}
          </div>
          {requiresHumanConversations.length === 0 ? (
            <p className="text-sm text-slate-500">No hay conversaciones que requieran atención.</p>
          ) : (
            <div className="space-y-3">
              {requiresHumanConversations.map((conversation) => {
                const initials = (conversation.contactName ?? conversation.phone)
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <div key={conversation.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="truncate text-sm font-medium">{conversation.contactName ?? conversation.phone}</span>
                        <span className="text-xs text-slate-400">{formatTime(conversation.lastMessageAt, timezone)}</span>
                      </div>
                      <p className="truncate text-xs text-slate-500">Esperando respuesta del equipo</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link href="/mensajes" className="mt-4 flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 text-sm font-medium text-slate-700">
            <MessageCircle size={16} className="mr-2" />
            Abrir mensajes
          </Link>
        </section>
      </div>
    </section>
  );
}
