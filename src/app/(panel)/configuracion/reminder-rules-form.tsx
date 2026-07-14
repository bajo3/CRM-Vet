"use client";

import { useState, useTransition } from "react";
import { BellRing, CheckCircle2, Loader2, Save } from "lucide-react";
import { MEDICAL_RECORD_TYPE_OPTIONS } from "@/lib/validation/medical-record";
import { updateReminderRules } from "@/lib/actions/reminder-rules";
import type { MedicalRecordType } from "@prisma/client";

type Rule = { months: number; enabled: boolean };

export function ReminderRulesForm({
  rules,
  editable,
}: {
  rules: Partial<Record<MedicalRecordType, Rule>>;
  editable: boolean;
}) {
  const [values, setValues] = useState<Record<string, Rule>>(() =>
    Object.fromEntries(MEDICAL_RECORD_TYPE_OPTIONS.map((option) => [option.value, rules[option.value] ?? { months: 6, enabled: false }]))
  );
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setResult(null);
    startTransition(async () => {
      const response = await updateReminderRules({
        rules: MEDICAL_RECORD_TYPE_OPTIONS.map((option) => ({ type: option.value, ...values[option.value] })),
      });
      setResult({ ok: response.ok, message: response.ok ? "Cambios guardados correctamente." : response.message });
    });
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <span className="grid size-10 place-items-center rounded-2xl bg-amber-50 text-amber-600"><BellRing size={19} /></span>
        <div>
          <h2 className="font-semibold">Recordatorios automáticos</h2>
          <p className="text-xs text-slate-500">Definí cada cuánto sugerir el próximo control según el tipo de visita.</p>
        </div>
      </div>

      <fieldset disabled={!editable || pending} className="space-y-3 p-5 disabled:opacity-70 lg:p-6">
        {MEDICAL_RECORD_TYPE_OPTIONS.map((option) => {
          const value = values[option.value];
          return (
            <div key={option.value} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={value.enabled}
                  onChange={(event) => setValues((current) => ({ ...current, [option.value]: { ...current[option.value], enabled: event.target.checked } }))}
                  className="size-4 rounded accent-emerald-600"
                />
                {option.label}
              </label>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                Cada
                <input
                  type="number"
                  min={1}
                  max={36}
                  disabled={!value.enabled}
                  value={value.months}
                  onChange={(event) => setValues((current) => ({ ...current, [option.value]: { ...current[option.value], months: Number(event.target.value) } }))}
                  className="h-9 w-16 rounded-lg border border-slate-200 px-2 text-center text-sm outline-none focus:border-emerald-500 disabled:bg-slate-50"
                />
                meses
              </div>
            </div>
          );
        })}

        {result && (
          <div role="status" className={`flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {result.ok && <CheckCircle2 size={17} />}
            {result.message}
          </div>
        )}

        {editable && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              {pending ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
