import Link from "next/link";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftDate, todayISO } from "@/lib/services/agenda-schedule";
import { capitalize } from "@/lib/format";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Día pedido por `?fecha=`; nunca a futuro. */
export function resolveDay(fecha: string | undefined, timezone: string) {
  const today = todayISO(timezone);
  const date = fecha && ISO_DATE.test(fecha) && fecha <= today ? fecha : today;
  const label = capitalize(DateTime.fromISO(date, { zone: timezone }).setLocale("es").toFormat("cccc d 'de' LLLL"));
  return { date, today, isToday: date === today, label };
}

export function DayNav({ basePath, date, isToday, label, timezone }: { basePath: string; date: string; isToday: boolean; label: string; timezone: string }) {
  const arrow = "grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100";
  return (
    <div className="flex w-fit max-w-full items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
      <Link href={`${basePath}?fecha=${shiftDate(date, -1, timezone)}`} aria-label="Día anterior" className={arrow}>
        <ChevronLeft size={16} />
      </Link>
      <span className="min-w-44 px-1 text-center text-sm font-medium text-slate-700">{isToday ? `Hoy · ${label}` : label}</span>
      {isToday ? (
        <span className="grid size-9 place-items-center text-slate-300">
          <ChevronRight size={16} />
        </span>
      ) : (
        <Link href={`${basePath}?fecha=${shiftDate(date, 1, timezone)}`} aria-label="Día siguiente" className={arrow}>
          <ChevronRight size={16} />
        </Link>
      )}
      {!isToday && (
        <Link href={basePath} className="ml-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
          Hoy
        </Link>
      )}
    </div>
  );
}

export function Panel({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: React.ComponentType<{ size?: number }>; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <Icon size={20} />
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{text}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "default" | "rose" | "brand" }) {
  const color = tone === "rose" ? "text-rose-700" : tone === "brand" ? "text-brand-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
