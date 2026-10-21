import Link from "next/link";
import { DateTime } from "luxon";
import { AlertTriangle, ChevronLeft, ChevronRight, Package, Plus } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES, CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getCashDay, listProducts } from "@/lib/services/sales";
import { listExpiringLots } from "@/lib/services/stock";
import { listPendingCharges, PENDING_CHARGE_DAYS } from "@/lib/services/pending-charges";
import { listDebtors } from "@/lib/services/client-accounts";
import { shiftDate, todayISO } from "@/lib/services/agenda-schedule";
import { capitalize, formatDateShort, formatMoney, formatTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";
import { CashMovementForm } from "./cash-movement-form";
import { VoidSaleButton } from "./void-sale-button";
import { WaiveChargeButton } from "./waive-charge-button";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ fecha?: string; ok?: string }> }) {
  const session = await requireSession();
  const { fecha, ok } = await searchParams;
  const clinic = await getClinicSettings(session.clinicId);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const today = todayISO(timezone);
  const date = fecha && ISO_DATE.test(fecha) && fecha <= today ? fecha : today;
  const isToday = date === today;

  const [cash, products, expiringLots, pendingCharges, debtors] = await Promise.all([
    getCashDay(session.clinicId, timezone, date),
    listProducts(session.clinicId, true),
    listExpiringLots(session.clinicId),
    listPendingCharges(session.clinicId),
    listDebtors(session.clinicId),
  ]);
  const lowStock = products.filter((product) => product.lowStock);
  const debtTotal = debtors.reduce((sum, debtor) => sum + Math.round(debtor.balance * 100), 0) / 100;
  const canVoid = hasRole(session, CLINIC_CONFIG_ROLES);
  const canMoveCash = hasRole(session, CLIENT_MANAGE_ROLES);
  const dateLabel = capitalize(DateTime.fromISO(date, { zone: timezone }).setLocale("es").toFormat("cccc d 'de' LLLL"));
  const onAccountToday = cash.byMethod.find((row) => row.method === "ACCOUNT")?.total ?? 0;
  const collectedToday = Math.round((cash.salesTotal - onAccountToday + cash.paymentsTotal) * 100) / 100;
  const hasExpired = expiringLots.some((lot) => lot.expired);

  const alerts: { label: string; detail: string; href: string; tone: "amber" | "rose" }[] = [];
  if (lowStock.length > 0) {
    alerts.push({ label: `${lowStock.length} con stock bajo`, detail: lowStock.map((product) => product.name).join(", "), href: "/ventas/productos?filtro=bajo", tone: "amber" });
  }
  if (expiringLots.length > 0) {
    alerts.push({
      label: `${expiringLots.length} ${expiringLots.length === 1 ? "lote" : "lotes"} ${hasExpired ? "vencido o por vencer" : "por vencer"}`,
      detail: expiringLots.map((lot) => `${lot.product.name} · ${lot.expired ? "vencido" : formatDateShort(lot.expiresAt!, timezone)}`).join(", "),
      href: `/ventas/productos/${expiringLots[0].product.id}`,
      tone: hasExpired ? "rose" : "amber",
    });
  }

  const summary = [
    { label: "Vendido", value: formatMoney(cash.salesTotal), hint: cash.salesCount === 1 ? "1 venta" : `${cash.salesCount} ventas` },
    { label: "Cobrado", value: formatMoney(collectedToday), hint: onAccountToday > 0 ? `${formatMoney(onAccountToday)} quedó a cuenta` : "Sin ventas a cuenta" },
    { label: "Efectivo en caja", value: formatMoney(cash.cashInDrawer), hint: "Cobros en efectivo ± movimientos" },
    { label: "Deuda de clientes", value: formatMoney(debtTotal), hint: debtors.length === 1 ? "1 cliente" : `${debtors.length} clientes` },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-xl font-bold tracking-tight">Caja</h1>
          <div className="flex items-center gap-1">
            <Link href={`/ventas?fecha=${shiftDate(date, -1, timezone)}`} aria-label="Día anterior" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
              <ChevronLeft size={16} />
            </Link>
            <span className="min-w-40 text-center text-sm font-medium text-slate-700">{isToday ? `Hoy · ${dateLabel}` : dateLabel}</span>
            {isToday ? (
              <span className="grid size-8 place-items-center text-slate-300">
                <ChevronRight size={16} />
              </span>
            ) : (
              <Link href={`/ventas?fecha=${shiftDate(date, 1, timezone)}`} aria-label="Día siguiente" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                <ChevronRight size={16} />
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/ventas/productos" className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Package size={15} />
            Productos y stock
          </Link>
          <Link href="/ventas/nueva" className="flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus size={15} />
            Nueva venta
          </Link>
        </div>
      </header>

      {ok && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{ok}</p>}

      {/* Resumen del día en una sola franja, en vez de cuatro tarjetas sueltas. */}
      <section className="mb-5 rounded-xl border border-slate-200 bg-white">
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          {summary.map((item, index) => (
            <div key={item.label} className={`px-4 py-3.5 ${index % 2 === 1 ? "border-l border-slate-100" : ""} ${index > 0 ? "sm:border-l sm:border-slate-100" : ""} ${index >= 2 ? "border-t border-slate-100 sm:border-t-0" : ""}`}>
              <dt className="text-xs font-medium text-slate-500">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{item.value}</dd>
              <p className="mt-0.5 truncate text-xs text-slate-400">{item.hint}</p>
            </div>
          ))}
        </dl>
        {cash.byMethod.length > 0 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{cash.byMethod.map((row) => `${PAYMENT_METHOD_LABELS[row.method]} ${formatMoney(row.total)}`).join("  ·  ")}</p>
        )}
      </section>

      {alerts.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {alerts.map((alert) => (
            <Link
              key={alert.label}
              href={alert.href}
              title={alert.detail}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                alert.tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100" : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
              }`}
            >
              <AlertTriangle size={13} />
              {alert.label}
            </Link>
          ))}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {pendingCharges.length > 0 && (
            <Panel title="Pendientes de cobro" hint={`Atendido y sin cobrar · últimos ${PENDING_CHARGE_DAYS} días`}>
              <ul className="divide-y divide-slate-100">
                {pendingCharges.map((charge) => (
                  <li key={charge.petId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {charge.petName} <span className="font-normal text-slate-500">· {charge.clientName}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {[
                          ...charge.appointments.map((row) => `Turno ${formatDateShort(row.startAt, timezone)}`),
                          ...charge.usages.map((line) => (line.quantity > 1 ? `${line.quantity} × ${line.productName}` : line.productName)),
                        ].join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {charge.usagesTotal > 0 && <span className="text-sm font-semibold tabular-nums">{formatMoney(charge.usagesTotal)}</span>}
                      {canMoveCash && <WaiveChargeButton petId={charge.petId} />}
                      <Link href={`/ventas/nueva?petId=${charge.petId}`} className="flex h-8 items-center rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700">
                        Cobrar
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Ventas" hint={isToday ? undefined : dateLabel}>
            {cash.sales.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">{isToday ? "Todavía no hay ventas hoy." : "No hubo ventas ese día."}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cash.sales.map((sale) => {
                  const voided = sale.status === "VOIDED";
                  return (
                    <li key={sale.id} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3">
                      <span className="pt-0.5 text-xs tabular-nums text-slate-400">{formatTime(sale.createdAt, timezone)}</span>
                      <div className="min-w-0">
                        <p className={`text-sm ${voided ? "text-slate-400 line-through" : "font-medium text-slate-800"}`}>
                          {sale.items.map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.description}` : item.description)).join(", ")}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                          {sale.client ? ` · ${sale.client.name}${sale.pet ? ` (${sale.pet.name})` : ""}` : ""} · {sale.user.name}
                          {sale.notes ? ` · ${sale.notes}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-sm font-semibold tabular-nums ${voided ? "text-slate-400 line-through" : ""}`}>{formatMoney(sale.total)}</span>
                        {voided ? <span className="text-xs text-slate-400">Anulada</span> : canVoid && <VoidSaleButton saleId={sale.id} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Movimientos de efectivo" hint="Lo que entra o sale sin ser una venta">
            <div className="space-y-3 p-3">
              {isToday && canMoveCash && <CashMovementForm />}
              {cash.movements.length === 0 && cash.payments.length === 0 ? (
                <p className="px-1 py-1 text-xs text-slate-400">Sin movimientos.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {cash.payments.map((payment) => (
                    <li key={payment.id}>
                      <Link href={`/clientes/${payment.client.id}/cuenta`} className="flex items-start justify-between gap-3 px-1 py-2 text-sm hover:text-brand-700">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">Pago de {payment.client.name}</span>
                          <span className="block text-xs text-slate-500">
                            {formatTime(payment.createdAt, timezone)} · {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-brand-700">+ {formatMoney(payment.amount)}</span>
                      </Link>
                    </li>
                  ))}
                  {cash.movements.map((movement) => (
                    <li key={movement.id} className="flex items-start justify-between gap-3 px-1 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{movement.description}</span>
                        <span className="block text-xs text-slate-500">
                          {formatTime(movement.createdAt, timezone)} · {movement.user.name}
                        </span>
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${movement.type === "IN" ? "text-brand-700" : "text-rose-700"}`}>
                        {movement.type === "IN" ? "+" : "−"} {formatMoney(movement.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel title="Deben" hint={debtors.length === 0 ? "Ningún cliente debe plata" : "Ventas a cuenta pendientes de pago"}>
            {debtors.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400">Todo al día.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {debtors.slice(0, 8).map((debtor) => (
                  <li key={debtor.id}>
                    <Link href={`/clientes/${debtor.id}/cuenta`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                      <span className="truncate">{debtor.name}</span>
                      <span className="shrink-0 font-medium tabular-nums text-rose-700">{formatMoney(debtor.balance)}</span>
                    </Link>
                  </li>
                ))}
                {debtors.length > 8 && <li className="px-4 py-2 text-xs text-slate-400">Y {debtors.length - 8} más.</li>}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}
