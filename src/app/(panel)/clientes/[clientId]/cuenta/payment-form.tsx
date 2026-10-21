"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { registerClientPaymentAction } from "@/lib/actions/sales";
import { MONEY_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";

const INPUT_CLASS = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400";

export function PaymentForm({ clientId, suggestedAmount }: { clientId: string; suggestedAmount: number | null }) {
  const router = useRouter();
  const [amount, setAmount] = useState(suggestedAmount ? String(suggestedAmount).replace(".", ",") : "");
  const [method, setMethod] = useState<(typeof MONEY_PAYMENT_METHODS)[number]>("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await registerClientPaymentAction(clientId, { amount: Number(amount.replace(/\./g, "").replace(",", ".")), paymentMethod: method, note });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAmount("");
      setNote("");
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" noValidate>
      <h2 className="text-sm font-semibold">Registrar pago</h2>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <input aria-label="Importe del pago" inputMode="decimal" placeholder="Importe" value={amount} onChange={(event) => setAmount(event.target.value)} className={INPUT_CLASS} />
        <input aria-label="Nota del pago" placeholder="Nota (opcional)" value={note} onChange={(event) => setNote(event.target.value)} className={INPUT_CLASS} />
      </div>
      <div role="radiogroup" aria-label="Medio de pago" className="flex flex-wrap gap-2">
        {MONEY_PAYMENT_METHODS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => setMethod(value)}
            className={`h-9 rounded-xl border px-3 text-xs font-medium ${method === value ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-700 hover:border-brand-300"}`}
          >
            {PAYMENT_METHOD_LABELS[value]}
          </button>
        ))}
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {saved && !error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">Pago registrado.</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={isPending} className="flex h-9 items-center gap-2 rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 size={13} className="animate-spin" />}
          Registrar pago
        </button>
      </div>
    </form>
  );
}
