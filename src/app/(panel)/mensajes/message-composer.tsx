"use client";
import { useState, useTransition } from "react";
import { sendHumanReply } from "@/lib/actions/messages";
export function MessageComposer({ conversationId, disabled }: { conversationId: string; disabled: boolean }) { const [text,setText]=useState(""); const [error,setError]=useState<string|null>(null); const [pending,startTransition]=useTransition(); return <form className="flex gap-2 border-t border-slate-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const result=await sendHumanReply(conversationId,text); if(result.ok){setText("");setError(null)}else setError(result.message); }); }}><div className="flex-1"><textarea value={text} onChange={(e)=>setText(e.target.value)} disabled={disabled||pending} placeholder={disabled ? "Toma la conversacion para responder" : "Escribi una respuesta"} rows={2} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm"/>{error&&<p className="text-xs text-rose-600">{error}</p>}</div><button disabled={disabled||pending||!text.trim()} className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white disabled:opacity-50">Enviar</button></form>; }


