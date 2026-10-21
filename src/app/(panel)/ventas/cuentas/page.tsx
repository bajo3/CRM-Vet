import Link from "next/link";
import { ChevronRight, Phone, UsersRound } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listDebtors } from "@/lib/services/client-accounts";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { EmptyState, Panel, Stat } from "../ui";

export default async function CuentasPage() {
  const session = await requireSession();
  const debtors = await listDebtors(session.clinicId);
  const total = debtors.reduce((sum, debtor) => sum + Math.round(debtor.balance * 100), 0) / 100;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:max-w-lg">
        <Stat label="Total que te deben" value={formatMoney(total)} tone={total > 0 ? "rose" : "default"} />
        <Stat label="Clientes con deuda" value={String(debtors.length)} hint={debtors.length === 0 ? "Todo al día" : "Ordenados de mayor a menor"} />
      </div>

      <Panel title="Quién debe" hint="Ventas que quedaron a cuenta y todavía no se pagaron. Entrá a un cliente para anotar un pago.">
        {debtors.length === 0 ? (
          <EmptyState icon={UsersRound} title="Nadie debe plata" text="Cuando cobres una venta “a cuenta”, el cliente aparece acá hasta que la pague." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {debtors.map((debtor) => (
              <li key={debtor.id}>
                <Link href={`/clientes/${debtor.id}/cuenta`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-50 text-xs font-semibold text-rose-700">
                    {debtor.name
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{debtor.name}</span>
                    {debtor.phone && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone size={11} />
                        {formatPhone(debtor.phone)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-rose-700">{formatMoney(debtor.balance)}</span>
                  <span className="hidden shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline">Anotar pago</span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
