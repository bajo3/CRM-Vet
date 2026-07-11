"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Vet = { id: string; name: string };

export function AgendaFilters({
  view,
  date,
  vetId,
  vets,
  timezone,
}: {
  view: "dia" | "semana";
  date: string;
  vetId?: string;
  vets: Vet[];
  timezone: string;
}) {
  const router = useRouter();

  function hrefFor(overrides: { date?: string; vet?: string; view?: "dia" | "semana" }) {
    const params = new URLSearchParams();
    params.set("view", overrides.view ?? view);
    params.set("date", overrides.date ?? date);
    const nextVet = overrides.vet !== undefined ? overrides.vet : vetId;
    if (nextVet && nextVet !== "todos") params.set("vet", nextVet);
    return `/agenda?${params.toString()}`;
  }

  const current = DateTime.fromISO(date, { zone: timezone });
  const step = view === "dia" ? { days: 1 } : { weeks: 1 };
  const prevDate = current.minus(step).toFormat("yyyy-MM-dd");
  const nextDate = current.plus(step).toFormat("yyyy-MM-dd");
  const todayDate = DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Link
          href={hrefFor({ date: prevDate })}
          aria-label="Anterior"
          className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft size={18} />
        </Link>
        <Link
          href={hrefFor({ date: todayDate })}
          className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Hoy
        </Link>
        <Link
          href={hrefFor({ date: nextDate })}
          aria-label="Siguiente"
          className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          <ChevronRight size={18} />
        </Link>
        <input
          type="date"
          value={date}
          onChange={(event) => event.target.value && router.push(hrefFor({ date: event.target.value }))}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-white p-1 text-sm">
          <Link
            href={hrefFor({ view: "dia" })}
            className={`flex h-8 items-center rounded-lg px-3 font-medium transition-colors ${view === "dia" ? "bg-emerald-600 text-white" : "text-slate-600"}`}
          >
            Día
          </Link>
          <Link
            href={hrefFor({ view: "semana" })}
            className={`flex h-8 items-center rounded-lg px-3 font-medium transition-colors ${view === "semana" ? "bg-emerald-600 text-white" : "text-slate-600"}`}
          >
            Semana
          </Link>
        </div>
        <select
          value={vetId ?? "todos"}
          onChange={(event) => router.push(hrefFor({ vet: event.target.value }))}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400"
        >
          <option value="todos">Todos los veterinarios</option>
          {vets.map((vet) => (
            <option key={vet.id} value={vet.id}>
              {vet.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
