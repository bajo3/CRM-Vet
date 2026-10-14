"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { waivePendingChargesAction } from "@/lib/actions/sales";

/** "No se cobra" pide confirmación en el lugar: saca el pendiente de la lista para siempre. */
export function WaiveChargeButton({ petId }: { petId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onWaive = () => {
    startTransition(async () => {
      await waivePendingChargesAction(petId);
      setConfirming(false);
      router.refresh();
    });
  };

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
        No se cobra
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <button type="button" onClick={onWaive} disabled={isPending} className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 size={12} className="animate-spin" />}
        Confirmar
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={isPending} className="font-medium text-slate-500 hover:text-slate-700">
        Cancelar
      </button>
    </span>
  );
}
