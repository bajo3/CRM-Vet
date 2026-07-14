"use client";

import { useState } from "react";
import { Receipt, ChevronDown } from "lucide-react";
import { QuoteForm } from "./quote-form";

export function QuotePanel({ petId }: { petId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Receipt size={18} className="text-emerald-600" />
          Nuevo presupuesto
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 p-5">
          <QuoteForm petId={petId} />
        </div>
      )}
    </section>
  );
}
