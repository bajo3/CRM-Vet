"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Download } from "lucide-react";
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
    reset,
    setError,
    formState: { errors },
  } = useForm<PrescriptionFormValues, unknown, PrescriptionFormInput>({
    resolver: zodResolver(prescriptionFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="prescription-content" className="mb-1.5 block text-sm font-medium text-slate-700">
          Indicación
        </label>
        <textarea
          id="prescription-content"
          rows={6}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400"
          placeholder="Meloxicam 0,2mg/kg cada 24hs por 5 días, vía oral, con alimento..."
          {...register("content")}
        />
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
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Generar receta
      </button>
    </form>
  );
}
