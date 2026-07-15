"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { clientFormSchema, type ClientFormInput, type ClientFormValues } from "@/lib/validation/client";
import { createClient, updateClient } from "@/lib/actions/clients";

type ClientFormProps = {
  mode: "create" | "edit";
  clientId?: string;
  defaultValues?: Partial<ClientFormValues>;
};

export function ClientForm({ mode, clientId, defaultValues }: ClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ClientFormValues, unknown, ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      phone: defaultValues?.phone ?? "",
      email: defaultValues?.email ?? "",
      address: defaultValues?.address ?? "",
      remindersEnabled: defaultValues?.remindersEnabled ?? true,
    },
  });

  const onSubmit = (data: ClientFormInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = mode === "create" ? await createClient(data) : await updateClient(clientId!, data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof ClientFormValues, { message });
          }
        }
        return;
      }
      router.push(`/clientes?ok=${encodeURIComponent(mode === "create" ? "Cliente creado." : "Cambios guardados.")}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
          Nombre y apellido
        </label>
        <input
          id="name"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          placeholder="María González"
          {...register("name")}
        />
        {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-700">
          Teléfono
        </label>
        <input
          id="phone"
          type="tel"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          placeholder="11 6001-1001"
          {...register("phone")}
        />
        {errors.phone && <p className="mt-1 text-xs text-rose-600">{errors.phone.message}</p>}
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Correo <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="email"
          type="email"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          placeholder="maria@correo.com"
          {...register("email")}
        />
        {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="address" className="mb-1.5 block text-sm font-medium text-slate-700">
          Dirección <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="address"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
          placeholder="Av. Rivadavia 4520, CABA"
          {...register("address")}
        />
        {errors.address && <p className="mt-1 text-xs text-rose-600">{errors.address.message}</p>}
      </div>

      <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-slate-700">Recordatorios automáticos por WhatsApp</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Si está activado, este cliente recibe automáticamente los avisos de próximos controles y turnos de sus mascotas.
          </span>
        </span>
        <input type="checkbox" className="size-5 shrink-0 accent-emerald-600" {...register("remindersEnabled")} />
      </label>

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
