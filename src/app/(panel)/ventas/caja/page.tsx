import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Banknote } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getCashDay } from "@/lib/services/sales";
import { formatMoney, formatTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";
import { CashMovementForm } from "../cash-movement-form";
import { DayNav, EmptyState, Panel, resolveDay } from "../ui";

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const session = await requireSession();
  const { fecha } = await searchParams;
  const clinic = await getClinicSettings(session.clinicId);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const day = resolveDay(fecha, timezone);
  const cash = await getCashDay(session.clinicId, timezone, day.date);
  const canMoveCash = hasRole(session, CLIENT_MANAGE_ROLES);

  const cashSales = cash.byMethod.find((row) => row.method === "CASH")?.total ?? 0;
  const cashPayments = cash.payments.filter((payment) => payment.paymentMethod === "CASH").reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) / 100;
  const breakdown = [
    { label: "Ventas en efectivo", value: cashSales, sign: "+" },
    { label: "Pagos de cuentas en efectivo", value: cashPayments, sign: "+" },
    { label: "Otros ingresos", value: cash.cashIn, sign: "+" },
    { label: "Egresos", value: cash.cashOut, sign: "−" },
  ];
  const otherMethods = cash.byMethod.filter((row) => row.method !== "CASH" && row.method !== "ACCOUNT");

  // Pagos de cuentas y movimientos manuales, en una sola lista ordenada por hora.
  const entries = [
    ...cash.payments.map((payment) => ({
      id: `p-${payment.id}`,
      at: payment.createdAt,
      title: `Pago de ${payment.client.name}`,
      detail: `${PAYMENT_METHOD_LABELS[payment.paymentMethod]} · ${payment.user.name}`,
      amount: payment.amount,
      incoming: true,
      href: `/clientes/${payment.client.id}/cuenta`,
    })),
    ...cash.movements.map((movement) => ({
      id: `m-${movement.id}`,
      at: movement.createdAt,
      title: movement.description,
      detail: `${movement.type === "IN" ? "Ingreso" : "Egreso"} en efectivo · ${movement.user.name}`,
      amount: movement.amount,
      incoming: movement.type === "IN",
      href: null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-5">
      <DayNav basePath="/ventas/caja" date={day.date} isToday={day.isToday} label={day.label} timezone={timezone} />

      <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="bg-ink-900 px-5 py-5 text-white">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                <Banknote size={14} />
                Efectivo en caja
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{formatMoney(cash.cashInDrawer)}</p>
              <p className="mt-1 text-xs text-slate-400">Lo que tendría que haber en el cajón {day.isToday ? "ahora" : "al cierre de ese día"}.</p>
            </div>
            <dl className="divide-y divide-slate-100 px-5">
              {breakdown.map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2.5 text-sm">
                  <dt className="text-slate-600">{row.label}</dt>
                  <dd className={`font-medium tabular-nums ${row.value === 0 ? "text-slate-400" : row.sign === "−" ? "text-rose-700" : "text-slate-800"}`}>
                    {row.sign} {formatMoney(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <Panel title="Otros medios de pago" hint="No entran al cajón; sirven para controlar con el banco o el posnet.">
            {otherMethods.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400">Sin cobros por otros medios.</p>
            ) : (
              <dl className="divide-y divide-slate-100 px-4">
                {otherMethods.map((row) => (
                  <div key={row.method} className="flex items-center justify-between py-2.5 text-sm">
                    <dt className="text-slate-600">{PAYMENT_METHOD_LABELS[row.method]}</dt>
                    <dd className="font-medium tabular-nums">{formatMoney(row.total)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
        </div>

        <Panel title="Entradas y salidas de efectivo" hint="Pagos de cuentas, gastos, retiros o cualquier plata que no sea una venta.">
          {day.isToday && canMoveCash && (
            <div className="border-b border-slate-100 p-4">
              <CashMovementForm />
            </div>
          )}
          {entries.length === 0 ? (
            <EmptyState icon={Banknote} title="Sin movimientos" text={day.isToday ? "Si pagás a un proveedor o sacás plata del cajón, anotalo acá para que la caja cierre." : undefined} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => {
                const content = (
                  <>
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${entry.incoming ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {entry.incoming ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{entry.title}</span>
                      <span className="block text-xs text-slate-500">
                        {formatTime(entry.at, timezone)} · {entry.detail}
                      </span>
                    </span>
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${entry.incoming ? "text-emerald-700" : "text-rose-700"}`}>
                      {entry.incoming ? "+" : "−"} {formatMoney(entry.amount)}
                    </span>
                  </>
                );
                return (
                  <li key={entry.id}>
                    {entry.href ? (
                      <Link href={entry.href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                        {content}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
