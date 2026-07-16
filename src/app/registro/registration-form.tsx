"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { registerClinicSchema, type RegisterClinicInput } from "@/lib/validation/clinic-registration";
import { registerClinic } from "@/lib/actions/clinic-registration";

export function RegistrationForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterClinicInput>({
    resolver: zodResolver(registerClinicSchema),
    defaultValues: { clinicName: "", clinicPhone: "", name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = (data: RegisterClinicInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await registerClinic(data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof RegisterClinicInput, { message });
          }
        }
        return;
      }
      setSubmitted(true);
    });
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 size={40} className="text-emerald-600" />
        <p className="font-medium">Recibimos tu solicitud</p>
        <p className="text-sm leading-6 text-slate-500">
          Vamos a revisar los datos de tu clínica y te habilitamos el acceso pronto. Cuando esté aprobada, vas a poder
          iniciar sesión con el correo y la contraseña que registraste.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Nombre de la clínica</label>
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
          placeholder="Veterinaria San Martín"
          {...register("clinicName")}
        />
        {errors.clinicName && <p className="mt-1 text-xs text-rose-600">{errors.clinicName.message}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Teléfono de la clínica (opcional)</label>
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
          placeholder="+54 9 11 1234-5678"
          {...register("clinicPhone")}
        />
        {errors.clinicPhone && <p className="mt-1 text-xs text-rose-600">{errors.clinicPhone.message}</p>}
      </div>

      <hr className="border-slate-100" />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Tu nombre y apellido</label>
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
          placeholder="Julia Pérez"
          {...register("name")}
        />
        {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Tu correo</label>
        <input
          type="email"
          autoComplete="email"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
          placeholder="vos@clinica.com"
          {...register("email")}
        />
        {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Contraseña</label>
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
          {...register("password")}
        />
        {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Repetir contraseña</label>
        <input
          type="password"
          autoComplete="new-password"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword.message}</p>}
      </div>

      {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Registrar mi clínica
      </button>
    </form>
  );
}
