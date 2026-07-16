"use client";

import { useState } from "react";
import { FileText, ChevronDown } from "lucide-react";
import { PrescriptionForm } from "./prescription-form";

export function PrescriptionPanel({ petId }: { petId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <section data-document-open={open} className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition ${open ? "border-sky-200 shadow-sky-100/70" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="prescription-form-panel"
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-50/70"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700"><FileText size={19} /></span>
          <span><span className="block font-semibold">Nueva receta</span><span className="mt-0.5 block text-xs font-normal text-slate-500">Indicación clara, firmada y lista para entregar</span></span>
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100"><ChevronDown size={16} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} /></span>
      </button>
      {open && (
        <div id="prescription-form-panel" className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
          <PrescriptionForm petId={petId} />
        </div>
      )}
    </section>
  );
}
