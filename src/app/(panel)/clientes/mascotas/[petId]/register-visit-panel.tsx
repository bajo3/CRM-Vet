"use client";

import { useState } from "react";
import { ClipboardPlus, ChevronDown } from "lucide-react";
import type { MedicalRecordType } from "@prisma/client";
import { MedicalRecordForm } from "./medical-record-form";

export function RegisterVisitPanel({
  petId,
  reminderRules,
}: {
  petId: string;
  reminderRules: Partial<Record<MedicalRecordType, { months: number; enabled: boolean }>>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <span className="flex items-center gap-2 font-semibold">
          <ClipboardPlus size={18} className="text-emerald-600" />
          Registrar atención
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 p-5">
          <MedicalRecordForm petId={petId} reminderRules={reminderRules} />
        </div>
      )}
    </section>
  );
}
