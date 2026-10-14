import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getClientAccount } from "@/lib/services/client-accounts";
import { formatDateShort, formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";
import { PaymentForm } from "./payment-form";

export default async function ClientAccountPage({ params }: { params: Promise<{ clientId: string }> }) {
  const session = await requireSession();
  const { clientId } = await params;
  const [account, clinic] = await Promise.all([getClientAccount(session.clinicId, clientId), getClinicSettings(session.clinicId)]);
  if (!account) notFound();
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const { client, balance, entries } = account;

  return (
    <section className="mx-auto max-w-3xl px-4 py-5 sm:px-7 lg:py-8">
      <Link href="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} />
        Clientes y mascotas
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuenta corriente</h1>
          <p className="mt-1 text-sm text-slate-500">
            {client.name} · {formatPhone(client.phone)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{balance > 0 ? "Debe" : balance < 0 ? "A favor" : "Saldo"}</p>
          <p className={`text-3xl font-semibold tabular-nums ${balance > 0 ? "text-rose-700" : balance < 0 ? "text-emerald-700" : ""}`}>{formatMoney(Math.abs(balance))}</p>
        </div>
      </div>

      {hasRole(session, CLIENT_MANAGE_ROLES) && <PaymentForm clientId={client.id} suggestedAmount={balance > 0 ? balance : null} />}

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Movimientos</h2>
        {entries.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">Sin movimientos. Las ventas cobradas «A cuenta» aparecen acá.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className={`font-medium ${entry.voided ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {entry.kind === "sale" ? "Venta a cuenta" : `Pago · ${PAYMENT_METHOD_LABELS[entry.paymentMethod]}`}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatDateShort(entry.at, timezone)}
                    {entry.detail && ` · ${entry.detail}`}
                    {entry.kind === "payment" && ` · ${entry.userName}`}
                    {entry.voided && " · anulada"}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${entry.voided ? "text-slate-400 line-through" : entry.kind === "payment" ? "text-emerald-700" : "text-rose-700"}`}>
                  {entry.kind === "payment" ? "−" : "+"} {formatMoney(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
