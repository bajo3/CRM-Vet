"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { sendHumanReply } from "@/lib/actions/messages";

export function MessageComposer({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="border-t border-slate-200 bg-white p-3 sm:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await sendHumanReply(conversationId, text);
          if (result.ok) { setText(""); setError(null); }
          else setError(result.message);
        });
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-500/10">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && text.trim() && !disabled && !pending) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={disabled || pending}
          placeholder={disabled ? "Tomá la conversación para responder" : "Escribí un mensaje…"}
          rows={2}
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
        />
        <button type="submit" aria-label="Enviar mensaje" disabled={disabled || pending || !text.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
          {pending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
      <div className="mt-1.5 flex justify-between px-1 text-[11px] text-slate-400"><span>{error ? <span className="text-rose-600">{error}</span> : "Enter para enviar · Shift + Enter para una nueva línea"}</span><span>{text.length}/2000</span></div>
    </form>
  );
}
