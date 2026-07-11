import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { AGENDA_MANAGE_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getActiveVeterinarians, getAppointmentsForDay, getAppointmentsForWeek, buildDaySlots } from "@/lib/queries/agenda";
import { getWeekStart, getWeekDates, todayISO } from "@/lib/services/agenda-schedule";
import { AgendaFilters } from "./agenda-filters";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";

type SearchParams = { view?: string; date?: string; vet?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const params = await searchParams;

  const [clinic, vets] = await Promise.all([
    getClinicSettings(session.clinicId),
    getActiveVeterinarians(session.clinicId),
  ]);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";

  const view: "dia" | "semana" = params.view === "semana" ? "semana" : "dia";
  const date = params.date && ISO_DATE.test(params.date) ? params.date : todayISO(timezone);
  const vetId = params.vet && params.vet !== "todos" ? params.vet : undefined;

  const canCreate = hasRole(session, AGENDA_MANAGE_ROLES);

  let content: React.ReactNode;
  if (view === "dia") {
    const appointments = await getAppointmentsForDay(session.clinicId, date, timezone, vetId);
    const slots = buildDaySlots(clinic?.openingHours, date, timezone, clinic?.defaultAppointmentDuration ?? 30, appointments);
    const columns = vetId ? vets.filter((vet) => vet.id === vetId) : vets;
    content = <DayView date={date} timezone={timezone} slots={slots} vets={columns} appointments={appointments} canCreate={canCreate} />;
  } else {
    const weekStart = getWeekStart(date, timezone);
    const weekDates = getWeekDates(weekStart, timezone);
    const appointments = await getAppointmentsForWeek(session.clinicId, weekStart, timezone, vetId);
    content = <WeekView weekDates={weekDates} timezone={timezone} appointments={appointments} showVet={!vetId} vetId={vetId} canCreate={canCreate} />;
  }

  return (
    <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agenda</h1>
        {canCreate && (
          <Link
            href={`/agenda/nuevo?date=${date}${vetId ? `&vetId=${vetId}` : ""}`}
            className="flex h-11 w-fit items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white shadow-sm shadow-emerald-200"
          >
            <Plus size={17} />
            Nuevo turno
          </Link>
        )}
      </header>

      <AgendaFilters view={view} date={date} vetId={vetId} vets={vets} timezone={timezone} />

      {content}
    </section>
  );
}
