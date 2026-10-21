import Link from "next/link";
import { HandCoins, Plus, Receipt } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES, CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getCashDay } from "@/lib/services/sales";
import { listPendingCharges, PENDING_CHARGE_DAYS } from "@/lib/services/pending-charges";
import { formatDateShort, formatMoney, formatTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";
import { VoidSaleButton } from "./void-sale-button";
import { WaiveChargeButton } from "./waive-charge-button";
import { DayNav, EmptyState, Panel, Stat, resolveDay } from "./ui";

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ fecha?: string; ok?: string }> }) {
  const session = await requireSession();
  const { fecha, ok } = await searchParams;
  const clinic = await getClinicSettings(session.clinicId);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const day = resolveDay(fecha, timezone);

  const [cash, pendingCharges] = await Promise.all([getCashDay(session.clinicId, timezone, day.date), day.isToday ? listPendingCharges(session.clinicId) : Promise.resolve([])]);
  const canVoid = hasRole(session, CLINIC_CONFIG_ROLES);
  const canWaive = hasRole(session, CLIENT_MANAGE_ROLES);
  const onAccount = cash.byMethod.find((row) => row.method === "ACCOUNT")?.total ?? 0;
  const collected = Math.round((cash.salesTotal - onAccount) * 100) / 100;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DayNav basePath="/ventas" date={day.date} isToday={day.isToday} label={day.label} timezone={timezone} />
        <Link href="/ventas/nueva" className="flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm shadow-brand-200 hover:bg-brand-700">
          <Plus size={17} />
          Nueva venta
        </Link>
      </div>

      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{ok}</p>}

      {pendingCharges.length > 0 && (
        <Panel title={pendingCharges.length === 1 ? "1 atención para cobrar" : `${pendingCharges.length} atenciones para cobrar`} hint={`Atendido y sin cobrar · últimos ${PENDING_CHARGE_DAYS} días`}>
          <ul className="divide-y divide-slate-100">
            {pendingCharges.map((charge) => (
              <li key={charge.petId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
                    <HandCoins size={17} />
                  </span>
                  <div className="min-w-0">
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
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {charge.usagesTotal > 0 && <span className="text-sm font-semibold tabular-nums">{formatMoney(charge.usagesTotal)}</span>}
                  {canWaive && <WaiveChargeButton petId={charge.petId} />}
                  <Link href={`/ventas/nueva?petId=${charge.petId}`} className="flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
                    Cobrar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Vendido" value={formatMoney(cash.salesTotal)} hint={cash.salesCount === 1 ? "1 venta" : `${cash.salesCount} ventas`} />
        <Stat label="Cobrado en el momento" value={formatMoney(collected)} hint={cash.byMethod.filter((row) => row.method !== "ACCOUNT").map((row) => `${PAYMENT_METHOD_LABELS[row.method]} ${formatMoney(row.total)}`).join(" · ") || "Sin cobros"} />
        <div className="col-span-2 sm:col-span-1">
          <Stat label="Quedó a cuenta" value={formatMoney(onAccount)} hint={onAccount > 0 ? "Se suma a cuentas corrientes" : "Nada a cuenta"} tone={onAccount > 0 ? "rose" : "default"} />
        </div>
      </div>

      <Panel title={day.isToday ? "Ventas de hoy" : `Ventas del ${day.label.toLowerCase()}`}>
        {cash.sales.length === 0 ? (
          <EmptyState icon={Receipt} title={day.isToday ? "Todavía no hay ventas hoy" : "No hubo ventas ese día"} text={day.isToday ? "Tocá “Nueva venta” para cobrar un producto, un servicio o una consulta." : undefined} />
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
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span>
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
  );
}
