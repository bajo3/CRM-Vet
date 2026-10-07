"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { onlineBookingSchema, type OnlineBookingFormInput } from "@/lib/validation/online-booking";
import { getPublicSlots, submitOnlineBooking } from "@/lib/actions/online-booking";

const INPUT_CLASS = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400";
const LABEL_CLASS = "mb-1.5 block text-sm font-medium text-slate-700";

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function BookingForm({ slug, minDate, maxDate }: { slug: string; minDate: string; maxDate: string }) {
  const [isPending, startTransition] = useTransition();
  const [isLoadingSlots, startSlotsTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState<{ date: string; time: string } | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<OnlineBookingFormInput>({
    resolver: zodResolver(onlineBookingSchema),
    defaultValues: { slug, clientName: "", phone: "", petName: "", reason: "", date: "", time: "" },
  });
  const selectedDate = useWatch({ control, name: "date" });
  const selectedTime = useWatch({ control, name: "time" });

  const loadSlots = (date: string) => {
    setValue("time", "");
    setSlots(null);
    if (!date) return;
    startSlotsTransition(async () => {
      setSlots(await getPublicSlots(slug, date));
    });
  };

  const onSubmit = (data: OnlineBookingFormInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await submitOnlineBooking(data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof OnlineBookingFormInput, { message });
          }
        }
        // El horario pudo haberse ocupado mientras completaba el formulario: se refresca la lista.
        loadSlots(data.date);
        return;
      }
      setConfirmed({ date: result.date, time: result.time });
    });
  };

  if (confirmed) {
    return (
      <div className="py-4 text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-600" />
        <h2 className="mt-3 text-lg font-semibold">¡Turno reservado!</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Te esperamos el <strong>{formatDate(confirmed.date)}</strong> a las <strong>{confirmed.time}</strong>. La clínica puede contactarte para confirmarlo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="reserva-nombre" className={LABEL_CLASS}>Tu nombre y apellido</label>
        <input id="reserva-nombre" autoComplete="name" className={INPUT_CLASS} {...register("clientName")} />
        {errors.clientName && <p className="mt-1 text-xs text-rose-600">{errors.clientName.message}</p>}
      </div>

      <div>
        <label htmlFor="reserva-telefono" className={LABEL_CLASS}>Teléfono (WhatsApp)</label>
        <input id="reserva-telefono" type="tel" autoComplete="tel" placeholder="11 6001-1001" className={INPUT_CLASS} {...register("phone")} />
        {errors.phone && <p className="mt-1 text-xs text-rose-600">{errors.phone.message}</p>}
      </div>

      <div>
        <label htmlFor="reserva-mascota" className={LABEL_CLASS}>Nombre de tu mascota</label>
        <input id="reserva-mascota" className={INPUT_CLASS} {...register("petName")} />
        {errors.petName && <p className="mt-1 text-xs text-rose-600">{errors.petName.message}</p>}
      </div>

      <div>
        <label htmlFor="reserva-motivo" className={LABEL_CLASS}>Motivo de la consulta</label>
        <input id="reserva-motivo" placeholder="Vacunación, control, consulta..." className={INPUT_CLASS} {...register("reason")} />
        {errors.reason && <p className="mt-1 text-xs text-rose-600">{errors.reason.message}</p>}
      </div>

      <div>
        <label htmlFor="reserva-fecha" className={LABEL_CLASS}>Fecha</label>
        <input
          id="reserva-fecha"
          type="date"
          min={minDate}
          max={maxDate}
          className={INPUT_CLASS}
          {...register("date", { onChange: (event) => loadSlots(event.target.value) })}
        />
        {errors.date && <p className="mt-1 text-xs text-rose-600">{errors.date.message}</p>}
      </div>

      {selectedDate && (
        <div>
          <p className={LABEL_CLASS}>Horario</p>
          {isLoadingSlots || slots === null ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" /> Buscando horarios…
            </p>
          ) : slots.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">No quedan horarios libres ese día. Probá con otra fecha.</p>
          ) : (
            <div role="radiogroup" aria-label="Horario" className="grid grid-cols-4 gap-2">
              {slots.map((time) => (
                <button
                  key={time}
                  type="button"
                  role="radio"
                  aria-checked={selectedTime === time}
                  onClick={() => setValue("time", time, { shouldValidate: true })}
                  className={`h-10 rounded-xl border text-sm font-medium ${
                    selectedTime === time ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-700 hover:border-emerald-300"
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          )}
          {errors.time && <p className="mt-1 text-xs text-rose-600">{errors.time.message}</p>}
        </div>
      )}

      {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Reservar turno
      </button>
    </form>
  );
}
