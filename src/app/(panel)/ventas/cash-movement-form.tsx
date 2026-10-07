"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createCashMovementAction } from "@/lib/actions/sales";

const INPUT_CLASS = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400";

export function CashMovementForm() {
  const router = useRouter();
  const [type, setType] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCashMovementAction({ type, amount: Number(amount.replace(",", ".")), description });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAmount("");
      setDescription("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3" noValidate>
      <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1">
        {(["OUT", "IN"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={type === value}
            onClick={() => setType(value)}
            className={`h-8 rounded-lg text-xs font-semibold ${type === value ? (value === "IN" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "text-slate-600"}`}
          >
            {value === "IN" ? "Ingreso" : "Egreso"}
          </button>
        ))}
      </div>
      <input aria-label="Importe" inputMode="decimal" placeholder="Importe" value={amount} onChange={(event) => setAmount(event.target.value)} className={INPUT_CLASS} />
      <input aria-label="Descripción" placeholder="Ej: pago a proveedor" value={description} onChange={(event) => setDescription(event.target.value)} className={INPUT_CLASS} />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <button type="submit" disabled={isPending} className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-slate-800 text-xs font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 size={13} className="animate-spin" />}
        Registrar movimiento
      </button>
    </form>
  );
}
