"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { voidSaleAction } from "@/lib/actions/sales";

/** Anular pide una segunda confirmación en el lugar: devuelve stock y cambia los totales de la caja. */
export function VoidSaleButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onVoid = () => {
    setError(null);
    startTransition(async () => {
      const result = await voidSaleAction(saleId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  if (error) return <span className="text-xs text-rose-600">{error}</span>;
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-rose-600 hover:underline">
        Anular
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <button type="button" onClick={onVoid} disabled={isPending} className="flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 font-medium text-white disabled:opacity-60">
        {isPending && <Loader2 size={12} className="animate-spin" />}
        Confirmar anulación
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={isPending} className="font-medium text-slate-500 hover:text-slate-700">
        Cancelar
      </button>
    </span>
  );
}
