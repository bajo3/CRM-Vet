"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, Loader2, Send } from "lucide-react";
import { sendHumanReply } from "@/lib/actions/messages";

export function MessageComposer({
  conversationId,
  conversationStatus,
}: {
  conversationId: string;
  conversationStatus: "AUTOMATED" | "REQUIRES_HUMAN" | "HUMAN_ACTIVE" | "RESOLVED";
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [pending, startTransition] = useTransition();
  const takesControl = conversationStatus !== "HUMAN_ACTIVE";

  return (
    <form
      className="border-t border-slate-200 bg-white p-3 sm:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        setQueued(false);
        startTransition(async () => {
          try {
            const result = await sendHumanReply(conversationId, text);
            if (result.ok) {
              setText("");
              setError(null);
              setQueued(true);
              router.refresh();
            } else setError(result.message);
          } catch {
            setError("No pudimos guardar el mensaje. Probá de nuevo.");
          }
        });
      }}
    >
      {takesControl && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700">
          <Bot size={14} className="shrink-0" />
          <span>Podés escribir directamente. Al enviar, el bot se pausa y la conversación queda a tu cargo.</span>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-500/10">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && text.trim() && !pending) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={pending}
          maxLength={2000}
          placeholder="Escribí un mensaje…"
          rows={2}
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
        />
        <button type="submit" aria-label="Enviar mensaje" disabled={pending || !text.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
          {pending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
      <div className="mt-1.5 flex justify-between gap-3 px-1 text-[11px] text-slate-400"><span>{error ? <span className="text-rose-600">{error}</span> : queued ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} />Guardado. Estamos verificando la entrega.</span> : "Enter para enviar · Shift + Enter para una nueva línea"}</span><span>{text.length}/2000</span></div>
    </form>
  );
}
