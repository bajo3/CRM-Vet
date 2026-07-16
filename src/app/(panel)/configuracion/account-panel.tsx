"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";
import { changeOwnPasswordSchema, type ChangeOwnPasswordInput } from "@/lib/validation/team";
import { changeOwnPassword } from "@/lib/actions/team";

export function AccountPanel() {
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

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <span className="grid size-10 place-items-center rounded-2xl bg-slate-100 text-slate-600"><LockKeyhole size={18} /></span>
        <div>
          <h2 className="font-semibold">Mi cuenta</h2>
          <p className="text-xs text-slate-500">Cambiá tu contraseña de acceso</p>
        </div>
      </div>

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
