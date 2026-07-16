"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { MedicalRecordType } from "@prisma/client";
import {
  medicalRecordFormSchema,
  MEDICAL_RECORD_TYPE_OPTIONS,
  NEXT_CONTROL_OPTIONS,
  type MedicalRecordFormInput,
  type MedicalRecordFormValues,
} from "@/lib/validation/medical-record";
import { registerMedicalRecord } from "@/lib/actions/medical-records";

const DEFAULT_VALUES: MedicalRecordFormValues = {
  type: "CONSULTATION",
  reason: "",
  notes: "",
  weight: undefined,
  treatment: "",
  nextControlOption: "none",
  nextControlDate: "",
};

type ReminderRules = Partial<Record<MedicalRecordType, { months: number; enabled: boolean }>>;

function dateInNMonths(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function MedicalRecordForm({ petId, reminderRules }: { petId: string; reminderRules: ReminderRules }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ remindersScheduled: number } | null>(null);
  const [suggested, setSuggested] = useState<{ months: number } | null>(null);
  const [controlTouched, setControlTouched] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<MedicalRecordFormValues, unknown, MedicalRecordFormInput>({
    resolver: zodResolver(medicalRecordFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const [nextControlOption, watchedType] = useWatch({ control, name: ["nextControlOption", "type"] });
  const type = watchedType ?? "CONSULTATION";

  useEffect(() => {
    if (controlTouched) return;
    const timer = window.setTimeout(() => {
      const rule = reminderRules[type];
      if (!rule?.enabled) {
        setSuggested(null);
        return;
      }
      setValue("nextControlOption", "custom");
      setValue("nextControlDate", dateInNMonths(rule.months));
      setSuggested({ months: rule.months });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [controlTouched, reminderRules, setValue, type]);

  function markTouched() {
    setControlTouched(true);
    setSuggested(null);
  }

  const onSubmit = (data: MedicalRecordFormInput) => {
    setFormError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await registerMedicalRecord(petId, data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof MedicalRecordFormValues, { message });
          }
        }
        return;
      }
      reset(DEFAULT_VALUES);
      setControlTouched(false);
      setSuggested(null);
      setSuccess({ remindersScheduled: result.remindersScheduled });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="reason" className="mb-1.5 block text-sm font-medium text-slate-700">
          Motivo
        </label>
        <input
          id="reason"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          placeholder="Consulta de rutina"
          {...register("reason")}
        />
        {errors.reason && <p className="mt-1 text-xs text-rose-600">{errors.reason.message}</p>}
      </div>

      <div>
        <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-slate-700">
          Nota
        </label>
        <textarea
          id="notes"
          rows={3}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400"
          placeholder="Detalle de lo observado y lo indicado..."
          {...register("notes")}
        />
        {errors.notes && <p className="mt-1 text-xs text-rose-600">{errors.notes.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-slate-700">
            Tipo
          </label>
          <select
            id="type"
            defaultValue={DEFAULT_VALUES.type}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
            {...register("type")}
          >
            {MEDICAL_RECORD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="weight" className="mb-1.5 block text-sm font-medium text-slate-700">
            Peso (kg) <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            id="weight"
            type="number"
            step="0.1"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
            {...register("weight")}
          />
          {errors.weight && <p className="mt-1 text-xs text-rose-600">{errors.weight.message}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="treatment" className="mb-1.5 block text-sm font-medium text-slate-700">
          Vacuna o tratamiento <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="treatment"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          placeholder="Antirrábica, antiparasitario..."
          {...register("treatment")}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Próximo control</span>
        {suggested && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-700">
            <Sparkles size={13} />
            Sugerido automáticamente: en {suggested.months} {suggested.months === 1 ? "mes" : "meses"} (según la configuración de la clínica). Podés cambiarlo.
          </p>
        )}
        <Controller
          control={control}
          name="nextControlOption"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {NEXT_CONTROL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    markTouched();
                    field.onChange(option.value);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    field.value === option.value ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        />
        {nextControlOption === "custom" && (
          <div className="mt-3">
            <input
              type="date"
              className="h-11 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
              {...register("nextControlDate", { onChange: markTouched })}
            />
            {errors.nextControlDate && <p className="mt-1 text-xs text-rose-600">{errors.nextControlDate.message}</p>}
          </div>
        )}
      </div>

      {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      {success && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0" />
          {success.remindersScheduled > 0
            ? "Atención registrada. El cliente va a recibir el recordatorio del control por WhatsApp automáticamente."
            : "Atención registrada correctamente."}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Guardar atención
      </button>
    </form>
  );
}
