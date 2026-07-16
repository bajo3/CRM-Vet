"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDollarSign, Download, FileCheck2, Loader2, Plus, Trash2 } from "lucide-react";
import { quoteFormSchema, type QuoteFormInput, type QuoteFormValues } from "@/lib/validation/quote";
import { createQuoteAction } from "@/lib/actions/quotes";

const DEFAULT_VALUES: QuoteFormValues = {
  title: "",
  items: [{ description: "", amount: undefined as unknown as number }],
  notes: "",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}

export function QuoteForm({ petId }: { petId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<QuoteFormValues, unknown, QuoteFormInput>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const total = (items ?? []).reduce((sum, item) => {
    const amount = typeof item?.amount === "number" ? item.amount : Number(item?.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  useEffect(() => {
    if (!downloadUrl) return;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadUrl]);

  const onSubmit = (data: QuoteFormInput) => {
    setFormError(null);
    setDownloadUrl(null);
    startTransition(async () => {
      const result = await createQuoteAction(petId, data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof QuoteFormValues, { message });
          }
        }
        return;
      }
      reset(DEFAULT_VALUES);
      setDownloadUrl(`/api/documents/quotes/${result.id}/pdf`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
        <FileCheck2 size={19} className="mt-0.5 shrink-0 text-emerald-700" />
        <div><p className="text-sm font-semibold text-emerald-950">Documento listo para compartir</p><p className="mt-0.5 text-xs leading-5 text-emerald-800/80">Completá los conceptos; calculamos el total y generamos un PDF profesional automáticamente.</p></div>
      </div>
      <div>
        <label htmlFor="quote-title" className="mb-1.5 block text-sm font-medium text-slate-700">
          Título <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="quote-title"
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
          placeholder="Presupuesto cirugía"
          {...register("title")}
        />
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between"><span className="block text-sm font-medium text-slate-700">Detalle</span><span className="text-[11px] text-slate-400">{fields.length} {fields.length === 1 ? "concepto" : "conceptos"}</span></div>
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[28px_1fr_44px] items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[28px_1fr_150px_44px]">
              <span className="mt-2 grid size-7 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
              <div className="min-w-0">
                <label htmlFor={`quote-item-${field.id}`} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:hidden">Descripción</label>
                <input
                  id={`quote-item-${field.id}`}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  placeholder="Ej. Consulta clínica"
                  {...register(`items.${index}.description` as const)}
                />
                {errors.items?.[index]?.description && (
                  <p className="mt-1 text-xs text-rose-600">{errors.items[index]?.description?.message}</p>
                )}
              </div>
              <div className="col-start-2 sm:col-start-auto">
                <label htmlFor={`quote-amount-${field.id}`} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:hidden">Monto</label>
                <input
                  id={`quote-amount-${field.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  placeholder="$ 0,00"
                  {...register(`items.${index}.amount` as const)}
                />
                {errors.items?.[index]?.amount && (
                  <p className="mt-1 text-xs text-rose-600">{errors.items[index]?.amount?.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={fields.length <= 1}
                title="Quitar ítem"
                aria-label={`Quitar concepto ${index + 1}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        {errors.items?.root && <p className="mt-1 text-xs text-rose-600">{errors.items.root.message}</p>}
        {typeof errors.items?.message === "string" && <p className="mt-1 text-xs text-rose-600">{errors.items.message}</p>}
        <button
          type="button"
          onClick={() => append({ description: "", amount: undefined as unknown as number })}
          className="mt-3 flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
        >
          <Plus size={14} />
          Agregar ítem
        </button>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-4 text-white shadow-lg shadow-emerald-900/10">
        <span className="flex items-center gap-2 text-sm font-medium"><CircleDollarSign size={18} />Total del presupuesto</span>
        <span className="text-xl font-semibold tracking-tight">{formatCurrency(total)}</span>
      </div>

      <div>
        <label htmlFor="quote-notes" className="mb-1.5 block text-sm font-medium text-slate-700">
          Notas <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <textarea
          id="quote-notes"
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
          placeholder="Condiciones, validez, aclaraciones..."
          {...register("notes")}
        />
      </div>

      {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      {downloadUrl && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            Presupuesto generado correctamente.
          </span>
          <a href={downloadUrl} className="flex items-center gap-1.5 font-medium underline underline-offset-2">
            <Download size={14} />
            Descargar PDF de nuevo
          </a>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Generar presupuesto
      </button>
    </form>
  );
}
