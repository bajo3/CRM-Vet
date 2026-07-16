"use client";

import { useState } from "react";
import { Receipt, ChevronDown } from "lucide-react";
import { QuoteForm } from "./quote-form";

export function QuotePanel({ petId }: { petId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <section data-document-open={open} className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition ${open ? "border-emerald-200 shadow-emerald-100/60" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="quote-form-panel"
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-50/70"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Receipt size={19} /></span>
          <span><span className="block font-semibold">Nuevo presupuesto</span><span className="mt-0.5 block text-xs font-normal text-slate-500">Detalle de servicios, valores y condiciones</span></span>
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100"><ChevronDown size={16} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} /></span>
      </button>
      {open && (
        <div id="quote-form-panel" className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
          <QuoteForm petId={petId} />
        </div>
      )}
    </section>
  );
}
