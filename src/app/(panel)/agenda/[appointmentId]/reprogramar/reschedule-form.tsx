"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { rescheduleFormSchema, type RescheduleFormInput, type RescheduleFormValues } from "@/lib/validation/appointment";
import { rescheduleAppointmentAction, getAvailableSlotsAction } from "@/lib/actions/appointments";

export function RescheduleForm({ appointmentId, veterinarianId, defaultDate }: { appointmentId: string; veterinarianId: string; defaultDate: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    handleSubmit,
    register,
    control,
    watch,
    formState: { errors },
  } = useForm<RescheduleFormValues, unknown, RescheduleFormInput>({
    resolver: zodResolver(rescheduleFormSchema),
    defaultValues: { date: defaultDate, time: "" },
  });

  const date = watch("date");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  function loadSlots() {
    if (!date) return;
    setLoadingSlots(true);
    getAvailableSlotsAction(veterinarianId, date).then((result) => {
      setLoadingSlots(false);
      if ("slots" in result) setSlots(result.slots);
      else setSlots([]);
    });
  }

  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const onSubmit = (data: RescheduleFormInput) => {
    setFormError(null);
    setIsPending(true);
    rescheduleAppointmentAction(appointmentId, data).then((result) => {
      setIsPending(false);
      if (!result.ok) {
        setFormError(result.message);
        loadSlots();
        return;
      }
      router.push(`/agenda/${appointmentId}?ok=${encodeURIComponent("Turno reprogramado correctamente.")}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-slate-700">
          Nueva fecha
        </label>
        <input
          id="date"
          type="date"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          {...register("date")}
        />
        {errors.date && <p className="mt-1 text-xs text-rose-600">{errors.date.message}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Nuevo horario</label>
        {loadingSlots ? (
          <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            Buscando horarios disponibles...
          </p>
        ) : slots && slots.length === 0 ? (
          <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800">No hay horarios disponibles ese día para este veterinario.</p>
        ) : (
          <Controller
            control={control}
            name="time"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {(slots ?? []).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => field.onChange(slot)}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                      field.value === slot ? "border-emerald-500 bg-emerald-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          />
        )}
        {errors.time && <p className="mt-1 text-xs text-rose-600">{errors.time.message}</p>}
      </div>

      {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60"
        >
          {isPending && <Loader2 size={16} className="animate-spin" />}
          Confirmar nuevo horario
        </button>
      </div>
    </form>
  );
}
