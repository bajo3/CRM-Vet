"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";
import { changeOwnPasswordSchema, updateOwnLicenseNumberSchema, type ChangeOwnPasswordInput, type UpdateOwnLicenseNumberInput } from "@/lib/validation/team";
import { changeOwnPassword, updateOwnLicenseNumber } from "@/lib/actions/team";

export function AccountPanel({ licenseNumber }: { licenseNumber: string }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ChangeOwnPasswordInput>({
    resolver: zodResolver(changeOwnPasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const [isLicensePending, startLicenseTransition] = useTransition();
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [licenseSaved, setLicenseSaved] = useState(false);
  const {
    register: registerLicense,
    handleSubmit: handleLicenseSubmit,
    setError: setLicenseFieldError,
    formState: { errors: licenseErrors },
  } = useForm<UpdateOwnLicenseNumberInput>({
    resolver: zodResolver(updateOwnLicenseNumberSchema),
    defaultValues: { licenseNumber },
  });

  const onSubmit = (data: ChangeOwnPasswordInput) => {
    setFormError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await changeOwnPassword(data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof ChangeOwnPasswordInput, { message });
          }
        }
        return;
      }
      reset();
      setSaved(true);
    });
  };

  const onLicenseSubmit = (data: UpdateOwnLicenseNumberInput) => {
    setLicenseError(null);
    setLicenseSaved(false);
    startLicenseTransition(async () => {
      const result = await updateOwnLicenseNumber(data);
      if (!result.ok) {
        setLicenseError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setLicenseFieldError(field as keyof UpdateOwnLicenseNumberInput, { message });
          }
        }
        return;
      }
      setLicenseSaved(true);
    });
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <span className="grid size-10 place-items-center rounded-2xl bg-slate-100 text-slate-600"><LockKeyhole size={18} /></span>
        <div>
          <h2 className="font-semibold">Mi cuenta</h2>
          <p className="text-xs text-slate-500">Cambiá tu contraseña de acceso</p>
        </div>
      </div>

      <form onSubmit={handleLicenseSubmit(onLicenseSubmit)} className="space-y-3 border-b border-slate-100 p-5" noValidate>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Matrícula profesional</label>
          <input
            type="text"
            placeholder="Ej: MP 12345"
            maxLength={40}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            {...registerLicense("licenseNumber")}
          />
          <p className="mt-1 text-xs text-slate-400">Aparece en la firma de las recetas que generes.</p>
          {licenseErrors.licenseNumber && <p className="mt-1 text-xs text-rose-600">{licenseErrors.licenseNumber.message}</p>}
        </div>
        {licenseError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{licenseError}</p>}
        {licenseSaved && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 size={15} />
            Matrícula actualizada.
          </p>
        )}
        <button
          type="submit"
          disabled={isLicensePending}
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-60"
        >
          {isLicensePending && <Loader2 size={16} className="animate-spin" />}
          Guardar matrícula
        </button>
      </form>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 p-5" noValidate>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Contraseña actual</label>
          <input
            type="password"
            autoComplete="current-password"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            {...register("currentPassword")}
          />
          {errors.currentPassword && <p className="mt-1 text-xs text-rose-600">{errors.currentPassword.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Contraseña nueva</label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            {...register("newPassword")}
          />
          {errors.newPassword && <p className="mt-1 text-xs text-rose-600">{errors.newPassword.message}</p>}
        </div>
        {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
        {saved && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 size={15} />
            Contraseña actualizada.
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60"
        >
          {isPending && <Loader2 size={16} className="animate-spin" />}
          Cambiar contraseña
        </button>
      </form>
    </section>
  );
}
