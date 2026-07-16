"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2, PawPrint, Search, X } from "lucide-react";
import { appointmentFormSchema, REASON_CHIPS, type AppointmentFormInput, type AppointmentFormValues } from "@/lib/validation/appointment";
import { createAppointmentAction, getAvailableSlotsAction } from "@/lib/actions/appointments";

type PetOption = { id: string; name: string; species: string; clientName: string; clientPhone: string };
type VetOption = { id: string; name: string };

export function AppointmentForm({
  pets,
  vets,
  defaultValues,
}: {
  pets: PetOption[];
  vets: VetOption[];
  defaultValues: AppointmentFormValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<AppointmentFormValues, unknown, AppointmentFormInput>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues,
  });

  const [petId, veterinarianId, date] = useWatch({ control, name: ["petId", "veterinarianId", "date"] });

  const [petQuery, setPetQuery] = useState("");
  const selectedPet = useMemo(() => pets.find((pet) => pet.id === petId), [pets, petId]);

  const filteredPets = useMemo(() => {
    const q = petQuery.trim().toLowerCase();
    if (!q) return pets.slice(0, 6);
    return pets.filter((pet) => pet.name.toLowerCase().includes(q) || pet.clientName.toLowerCase().includes(q) || pet.clientPhone.includes(q)).slice(0, 6);
  }, [pets, petQuery]);

  const [selectedChip, setSelectedChip] = useState<(typeof REASON_CHIPS)[number] | null>(
    (REASON_CHIPS as readonly string[]).includes(defaultValues.reason) ? (defaultValues.reason as (typeof REASON_CHIPS)[number]) : defaultValues.reason ? "Otro" : null
  );

  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!veterinarianId || !date) {
        setSlots(null);
        return;
      }
      setLoadingSlots(true);
      getAvailableSlotsAction(veterinarianId, date).then((result) => {
        if (cancelled) return;
        setLoadingSlots(false);
        if ("slots" in result) setSlots(result.slots);
        else setSlots([]);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [veterinarianId, date]);

  function refreshSlots() {
    if (!veterinarianId || !date) return;
    setLoadingSlots(true);
    getAvailableSlotsAction(veterinarianId, date).then((result) => {
      setLoadingSlots(false);
      if ("slots" in result) setSlots(result.slots);
    });
  }

  const onSubmit = (data: AppointmentFormInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createAppointmentAction(data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof AppointmentFormValues, { message });
          }
        }
        if (result.message.includes("ocupó") || result.message.includes("ocupado") || result.message.includes("acaba de ocuparse")) {
          refreshSlots();
        }
        return;
      }
      router.push(`/agenda/${result.id}?ok=${encodeURIComponent("Turno creado correctamente.")}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Mascota</label>
        <input type="hidden" defaultValue={defaultValues.petId} {...register("petId")} />
        {selectedPet ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <PawPrint size={16} className="shrink-0 text-emerald-700" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-emerald-900">{selectedPet.name}</div>
                <div className="truncate text-xs text-emerald-700">
                  {selectedPet.clientName} · {selectedPet.clientPhone}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setValue("petId", "");
                setPetQuery("");
              }}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-100"
              aria-label="Cambiar mascota"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5">
              <Search size={16} className="text-slate-400" />
              <input
                value={petQuery}
                onChange={(event) => setPetQuery(event.target.value)}
                placeholder="Buscá por nombre de mascota, tutor o teléfono"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            {petQuery.trim().length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                {filteredPets.length === 0 ? (
                  <p className="p-3 text-sm text-slate-400">No encontramos mascotas con esa búsqueda.</p>
                ) : (
                  filteredPets.map((pet) => (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => {
                        setValue("petId", pet.id, { shouldValidate: true });
                        setPetQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium">{pet.name}</span>
                      <span className="truncate text-xs text-slate-500">
                        {pet.species} · {pet.clientName}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        {errors.petId && <p className="mt-1 text-xs text-rose-600">{errors.petId.message}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Motivo</label>
        <div className="flex flex-wrap gap-2">
          {REASON_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setSelectedChip(chip);
                setValue("reason", chip === "Otro" ? "" : chip, { shouldValidate: true });
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedChip === chip ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
        {selectedChip === "Otro" ? (
          <input
            className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
            placeholder="Describí el motivo del turno"
            {...register("reason")}
          />
        ) : (
          <input type="hidden" {...register("reason")} />
        )}
        {errors.reason && <p className="mt-1 text-xs text-rose-600">{errors.reason.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-slate-700">
            Fecha
          </label>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <input
                id="date"
                type="date"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
                name={field.name}
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
          {errors.date && <p className="mt-1 text-xs text-rose-600">{errors.date.message}</p>}
        </div>
        <div>
          <label htmlFor="veterinarianId" className="mb-1.5 block text-sm font-medium text-slate-700">
            Veterinario
          </label>
          <Controller
            control={control}
            name="veterinarianId"
            render={({ field }) => (
              <select
                id="veterinarianId"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
                name={field.name}
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                ref={field.ref}
              >
                <option value="">Elegí un veterinario</option>
                {vets.map((vet) => (
                  <option key={vet.id} value={vet.id}>
                    {vet.name}
                  </option>
                ))}
              </select>
            )}
          />
          {errors.veterinarianId && <p className="mt-1 text-xs text-rose-600">{errors.veterinarianId.message}</p>}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Horario</label>
        {!veterinarianId || !date ? (
          <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-500">Elegí veterinario y fecha para ver los horarios disponibles.</p>
        ) : loadingSlots ? (
          <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            Buscando horarios disponibles...
          </p>
        ) : slots && slots.length === 0 ? (
          <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800">No hay horarios disponibles ese día para ese veterinario.</p>
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
          Crear turno
        </button>
      </div>
    </form>
  );
}
