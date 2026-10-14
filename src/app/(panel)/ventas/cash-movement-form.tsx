"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createCashMovementAction } from "@/lib/actions/sales";

const FIELD_CLASS = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500";

export function CashMovementForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCashMovementAction({ type, amount: Number(amount.replace(/\./g, "").replace(",", ".")), description });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAmount("");
      setDescription("");
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
        <Plus size={13} />
        Registrar movimiento
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3" noValidate>
      <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/60 p-0.5">
        {(["OUT", "IN"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={type === value}
            onClick={() => setType(value)}
            className={`h-7 rounded-md text-xs font-medium ${type === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            {value === "IN" ? "Ingreso" : "Egreso"}
          </button>
        ))}
      </div>
      <input aria-label="Importe" inputMode="decimal" placeholder="Importe" value={amount} onChange={(event) => setAmount(event.target.value)} className={FIELD_CLASS} />
      <input aria-label="Descripción" placeholder="Ej: pago a proveedor" value={description} onChange={(event) => setDescription(event.target.value)} className={FIELD_CLASS} />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="h-8 rounded-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-700">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-medium text-white disabled:opacity-60">
          {isPending && <Loader2 size={12} className="animate-spin" />}
          Registrar
        </button>
      </div>
    </form>
  );
}
