import Link from "next/link";
import { DateTime } from "luxon";
import { AlertTriangle, ChevronLeft, ChevronRight, Package, Plus, Wallet } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES, CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getCashDay, listProducts } from "@/lib/services/sales";
import { shiftDate, todayISO } from "@/lib/services/agenda-schedule";
import { capitalize, formatMoney, formatTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";
import { CashMovementForm } from "./cash-movement-form";
import { VoidSaleButton } from "./void-sale-button";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ fecha?: string; ok?: string }> }) {
  const session = await requireSession();
  const { fecha, ok } = await searchParams;
  const clinic = await getClinicSettings(session.clinicId);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const today = todayISO(timezone);
  const date = fecha && ISO_DATE.test(fecha) && fecha <= today ? fecha : today;
  const isToday = date === today;

  const [cash, products] = await Promise.all([getCashDay(session.clinicId, timezone, date), listProducts(session.clinicId, true)]);
  const lowStock = products.filter((product) => product.lowStock);
  const canVoid = hasRole(session, CLINIC_CONFIG_ROLES);
  const canMoveCash = hasRole(session, CLIENT_MANAGE_ROLES);
  const dateLabel = capitalize(DateTime.fromISO(date, { zone: timezone }).setLocale("es").toFormat("cccc d 'de' LLLL"));

  const stats = [
    { label: "Ventas del día", value: formatMoney(cash.salesTotal), hint: cash.salesCount === 1 ? "1 venta" : `${cash.salesCount} ventas` },
    { label: "Efectivo en caja", value: formatMoney(cash.cashInDrawer), hint: "Ventas en efectivo + ingresos − egresos" },
    { label: "Ingresos manuales", value: formatMoney(cash.cashIn), hint: "Cambio inicial, aportes" },
    { label: "Egresos", value: formatMoney(cash.cashOut), hint: "Pagos y retiros" },
  ];

  return (
    <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Wallet size={16} />
            Caja
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ventas y caja</h1>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href={`/ventas?fecha=${shiftDate(date, -1, timezone)}`}
              aria-label="Día anterior"
              className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft size={16} />
            </Link>
            <span className="min-w-44 text-center text-sm font-medium text-slate-700">{isToday ? `Hoy · ${dateLabel}` : dateLabel}</span>
            {isToday ? (
              <span className="grid size-9 place-items-center rounded-xl border border-slate-100 text-slate-300">
                <ChevronRight size={16} />
              </span>
            ) : (
              <Link
                href={`/ventas?fecha=${shiftDate(date, 1, timezone)}`}
                aria-label="Día siguiente"
                className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                <ChevronRight size={16} />
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/ventas/productos" className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50">
            <Package size={17} />
            Productos y servicios
          </Link>
          <Link href="/ventas/nueva" className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white shadow-sm shadow-emerald-200">
            <Plus size={17} />
            Nueva venta
          </Link>
        </div>
      </header>

      {ok && <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">{ok}</p>}

      {lowStock.length > 0 && (
        <Link href="/ventas/productos" className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Stock bajo:</span> {lowStock.map((product) => `${product.name} (${product.stock})`).join(", ")}
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-600">{stat.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-500">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-semibold">Ventas</h2>
            {cash.byMethod.length > 0 && (
              <p className="mt-1 text-sm text-slate-500">{cash.byMethod.map((row) => `${PAYMENT_METHOD_LABELS[row.method]}: ${formatMoney(row.total)}`).join(" · ")}</p>
            )}
          </div>
          {cash.sales.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-400">{isToday ? "Todavía no hay ventas hoy." : "No hubo ventas ese día."}</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {cash.sales.map((sale) => {
                const voided = sale.status === "VOIDED";
                return (
                  <li key={sale.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${voided ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {sale.items.map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.description}` : item.description)).join(", ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatTime(sale.createdAt, timezone)} · {PAYMENT_METHOD_LABELS[sale.paymentMethod]} · {sale.user.name}
                        {sale.client ? ` · ${sale.client.name}${sale.pet ? ` (${sale.pet.name})` : ""}` : ""}
                      </p>
                      {sale.notes && <p className="mt-1 text-xs text-slate-500">{sale.notes}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {voided ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">Anulada</span>
                      ) : (
                        canVoid && <VoidSaleButton saleId={sale.id} />
                      )}
                      <span className={`text-sm font-semibold ${voided ? "text-slate-400 line-through" : ""}`}>{formatMoney(sale.total)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Movimientos de efectivo</h2>
          <p className="mt-1 text-sm text-slate-500">Ingresos y egresos que no son ventas.</p>
          {isToday && canMoveCash && <CashMovementForm />}
          {cash.movements.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">Sin movimientos.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {cash.movements.map((movement) => (
                <li key={movement.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700">{movement.description}</span>
                    <span className="block text-xs text-slate-500">
                      {formatTime(movement.createdAt, timezone)} · {movement.user.name}
                    </span>
                  </span>
                  <span className={`shrink-0 font-semibold ${movement.type === "IN" ? "text-emerald-700" : "text-rose-700"}`}>
                    {movement.type === "IN" ? "+" : "−"} {formatMoney(movement.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
