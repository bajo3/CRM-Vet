"use client";

import { useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { petFormSchema, type PetFormInput, type PetFormValues } from "@/lib/validation/pet";
import { createPet, updatePet } from "@/lib/actions/pets";
import { resizeImageToDataUrl } from "@/lib/image-resize";

const PHOTO_MAX_SIDE = 480;

type ClientOption = { id: string; name: string; phone: string };

type PetFormProps = {
  mode: "create" | "edit";
  petId?: string;
  clients: ClientOption[];
  defaultValues?: Partial<PetFormValues>;
};

export function PetForm({ mode, petId, clients, defaultValues }: PetFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<PetFormValues, unknown, PetFormInput>({
    resolver: zodResolver(petFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      species: defaultValues?.species ?? "",
      clientId: defaultValues?.clientId ?? "",
      photoUrl: defaultValues?.photoUrl ?? "",
      breed: defaultValues?.breed ?? "",
      sex: defaultValues?.sex ?? "",
      birthDate: defaultValues?.birthDate ?? "",
      approximateAge: defaultValues?.approximateAge ?? "",
      weight: defaultValues?.weight,
      notes: defaultValues?.notes ?? "",
    },
  });

  const photoUrl = useWatch({ control, name: "photoUrl" });

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      setValue("photoUrl", await resizeImageToDataUrl(file, PHOTO_MAX_SIDE), { shouldValidate: true });
    } catch {
      setPhotoError("No se pudo procesar la imagen. Probá con otro archivo.");
    }
  }

  const onSubmit = (data: PetFormInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = mode === "create" ? await createPet(data) : await updatePet(petId!, data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof PetFormValues, { message });
          }
        }
        return;
      }
      const destination = "id" in result ? result.id : petId!;
      router.push(`/clientes/mascotas/${destination}?ok=${encodeURIComponent(mode === "create" ? "Mascota creada." : "Cambios guardados.")}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
            Nombre
          </label>
          <input
            id="name"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
            placeholder="Lola"
            {...register("name")}
          />
          {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="species" className="mb-1.5 block text-sm font-medium text-slate-700">
            Especie
          </label>
          <input
            id="species"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
            placeholder="Perro, gato..."
            {...register("species")}
          />
          {errors.species && <p className="mt-1 text-xs text-rose-600">{errors.species.message}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="clientId" className="mb-1.5 block text-sm font-medium text-slate-700">
          Tutor
        </label>
        <select
          id="clientId"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          {...register("clientId")}
        >
          <option value="">Elegí un cliente</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} · {client.phone}
            </option>
          ))}
        </select>
        {errors.clientId && <p className="mt-1 text-xs text-rose-600">{errors.clientId.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="breed" className="mb-1.5 block text-sm font-medium text-slate-700">
            Raza <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            id="breed"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
            {...register("breed")}
          />
        </div>
        <div>
          <label htmlFor="sex" className="mb-1.5 block text-sm font-medium text-slate-700">
            Sexo <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <select id="sex" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400" {...register("sex")}>
            <option value="">Sin especificar</option>
            <option value="Macho">Macho</option>
            <option value="Hembra">Hembra</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="birthDate" className="mb-1.5 block text-sm font-medium text-slate-700">
            Fecha de nacimiento <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            id="birthDate"
            type="date"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
            {...register("birthDate")}
          />
          {errors.birthDate && <p className="mt-1 text-xs text-rose-600">{errors.birthDate.message}</p>}
        </div>
        <div>
          <label htmlFor="approximateAge" className="mb-1.5 block text-sm font-medium text-slate-700">
            Edad aproximada <span className="font-normal text-slate-400">(si no sabés la fecha)</span>
          </label>
          <input
            id="approximateAge"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
            placeholder="3 años"
            {...register("approximateAge")}
          />
        </div>
      </div>

      <div>
        <label htmlFor="weight" className="mb-1.5 block text-sm font-medium text-slate-700">
          Peso (kg) <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="weight"
          type="number"
          step="0.1"
          className="h-11 w-full max-w-[calc(50%-0.5rem)] rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          {...register("weight")}
        />
        {errors.weight && <p className="mt-1 text-xs text-rose-600">{errors.weight.message}</p>}
      </div>

      <div>
        <input type="hidden" {...register("photoUrl")} />
        <p className="mb-1.5 text-sm font-medium text-slate-700">
          Foto <span className="font-normal text-slate-400">(opcional)</span>
        </p>
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Foto de la mascota" className="size-full object-cover" />
            ) : (
              <ImageIcon size={22} className="text-slate-300" />
            )}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Upload size={13} />
              {photoUrl ? "Cambiar" : "Subir foto"}
            </button>
            {photoUrl && (
              <button
                type="button"
                onClick={() => { setValue("photoUrl", "", { shouldValidate: true }); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={13} />
                Quitar
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoChange} className="hidden" />
          </div>
        </div>
        {photoError && <p className="mt-1.5 text-xs text-rose-600">{photoError}</p>}
        {errors.photoUrl && <p className="mt-1.5 text-xs text-rose-600">{errors.photoUrl.message}</p>}
      </div>

      <div>
        <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-slate-700">
          Observaciones importantes <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <textarea
          id="notes"
          rows={3}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400"
          placeholder="Alergias, condiciones a tener en cuenta..."
          {...register("notes")}
        />
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
          Guardar
        </button>
      </div>
    </form>
  );
}
