"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { createCashMovementAction } from "@/lib/actions/sales";

const FIELD_CLASS = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500";

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
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setType("OUT");
            setOpen(true);
          }}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800"
        >
          <ArrowUpRight size={15} />
          Anotar egreso
        </button>
        <button
          type="button"
          onClick={() => {
            setType("IN");
            setOpen(true);
          }}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
        >
          <ArrowDownLeft size={15} />
          Anotar ingreso
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3" noValidate>
      <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/60 p-0.5">
        {(["OUT", "IN"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={type === value}
            onClick={() => setType(value)}
            className={`h-8 rounded-md text-sm font-medium ${type === value ? (value === "IN" ? "bg-white text-emerald-700 shadow-sm" : "bg-white text-rose-700 shadow-sm") : "text-slate-500"}`}
          >
            {value === "IN" ? "Entra plata" : "Sale plata"}
          </button>
        ))}
      </div>
      <input aria-label="Importe" inputMode="decimal" autoFocus placeholder="Importe" value={amount} onChange={(event) => setAmount(event.target.value)} className={FIELD_CLASS} />
      <input aria-label="Descripción" placeholder={type === "OUT" ? "Ej: pago a proveedor, retiro" : "Ej: cambio inicial del día"} value={description} onChange={(event) => setDescription(event.target.value)} className={FIELD_CLASS} />
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
