"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FilePenLine, Loader2, ShieldCheck } from "lucide-react";
import { prescriptionFormSchema, type PrescriptionFormInput, type PrescriptionFormValues } from "@/lib/validation/prescription";
import { createPrescriptionAction } from "@/lib/actions/prescriptions";

const DEFAULT_VALUES: PrescriptionFormValues = { content: "" };

export function PrescriptionForm({ petId }: { petId: string }) {
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
  } = useForm<PrescriptionFormValues, unknown, PrescriptionFormInput>({
    resolver: zodResolver(prescriptionFormSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const content = useWatch({ control, name: "content" }) ?? "";

  useEffect(() => {
    if (!downloadUrl) return;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadUrl]);

  const onSubmit = (data: PrescriptionFormInput) => {
    setFormError(null);
    setDownloadUrl(null);
    startTransition(async () => {
      const result = await createPrescriptionAction(petId, data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof PrescriptionFormValues, { message });
          }
        }
        return;
      }
      reset(DEFAULT_VALUES);
      setDownloadUrl(`/api/documents/prescriptions/${result.id}/pdf`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="flex gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
        <ShieldCheck size={19} className="mt-0.5 shrink-0 text-sky-700" />
        <div><p className="text-sm font-semibold text-sky-950">Indicación completa y legible</p><p className="mt-0.5 text-xs leading-5 text-sky-800/80">Incluí medicamento, dosis, frecuencia, duración y vía de administración.</p></div>
      </div>
      <div>
        <div className="mb-2 flex items-end justify-between"><label htmlFor="prescription-content" className="block text-sm font-medium text-slate-700">Indicación médica</label><span className="text-[11px] text-slate-400">{content.length}/4000</span></div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-500/10">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-500"><FilePenLine size={14} />Rp. /</div>
        <textarea
          id="prescription-content"
          rows={6}
          maxLength={4000}
          className="w-full resize-y bg-white px-4 py-4 text-sm leading-6 outline-none"
          placeholder="Meloxicam 0,2mg/kg cada 24hs por 5 días, vía oral, con alimento..."
          {...register("content")}
        />
        </div>
        {errors.content && <p className="mt-1 text-xs text-rose-600">{errors.content.message}</p>}
      </div>

      {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      {downloadUrl && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            Receta generada correctamente.
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
        Generar receta
      </button>
    </form>
  );
}
