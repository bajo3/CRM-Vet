"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { cancelScheduledMessage } from "@/lib/actions/scheduled-messages";

export function CancelScheduledMessageButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await cancelScheduledMessage(id);
            if (!result.ok) setError(result.message);
            else router.refresh();
          });
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
        Cancelar
      </button>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
