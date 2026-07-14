"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Trash2, Download } from "lucide-react";
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
    watch,
    setError,
    formState: { errors },
  } = useForm<QuoteFormValues, unknown, QuoteFormInput>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="quote-title" className="mb-1.5 block text-sm font-medium text-slate-700">
          Título <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="quote-title"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          placeholder="Presupuesto cirugía"
          {...register("title")}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Ítems</span>
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
                  placeholder="Descripción"
                  {...register(`items.${index}.description` as const)}
                />
                {errors.items?.[index]?.description && (
                  <p className="mt-1 text-xs text-rose-600">{errors.items[index]?.description?.message}</p>
                )}
              </div>
              <div className="w-32">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
                  placeholder="Monto"
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
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-rose-600 disabled:opacity-40"
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
          className="mt-2 flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Plus size={14} />
          Agregar ítem
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
        <span className="text-sm font-medium text-slate-600">Total</span>
        <span className="text-lg font-semibold text-emerald-700">{formatCurrency(total)}</span>
      </div>

      <div>
        <label htmlFor="quote-notes" className="mb-1.5 block text-sm font-medium text-slate-700">
          Notas <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <textarea
          id="quote-notes"
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400"
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
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Generar presupuesto
      </button>
    </form>
  );
}
