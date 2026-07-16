"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login } from "@/lib/actions/auth";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = (data: LoginInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await login(data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof LoginInput, { message });
          }
        }
        return;
      }
      router.push(result.redirectTo ?? "/");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Correo
        </label>
        <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-emerald-400">
          <Mail size={17} className="shrink-0 text-slate-400" />
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="vos@clinica.com"
            {...register("email")}
          />
        </div>
        {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Contraseña
        </label>
        <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-emerald-400">
          <Lock size={17} className="shrink-0 text-slate-400" />
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="••••••••"
            {...register("password")}
          />
        </div>
        {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
      </div>

      {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Entrar
      </button>
    </form>
  );
}
