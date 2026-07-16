"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Plus, ShieldCheck, UserCog, UsersRound, X } from "lucide-react";
import { addTeamMemberSchema, type AddTeamMemberInput, type AddTeamMemberValues } from "@/lib/validation/team";
import { addTeamMember, changeMemberRole, resetMemberPassword, toggleMemberActive } from "@/lib/actions/team";
import { roleLabel } from "@/lib/format";

const ROLE_OPTIONS = [
  ["OWNER", "Dueño/a"],
  ["ADMIN", "Administrador/a"],
  ["VETERINARIAN", "Veterinario/a"],
  ["RECEPTIONIST", "Recepción"],
] as const;

type Member = {
  id: string;
  userId: string;
  role: string;
  active: boolean;
  user: { name: string; email: string };
};

type TeamPanelProps = {
  members: Member[];
  canManage: boolean;
  currentUserId: string;
};

export function TeamPanel({ members, canManage, currentUserId }: TeamPanelProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <span className="grid size-10 place-items-center rounded-2xl bg-violet-50 text-violet-600"><UsersRound size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Equipo</h2>
          <p className="text-xs text-slate-500">{members.filter((member) => member.active).length} integrantes activos</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAddForm((value) => !value)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showAddForm ? <X size={14} /> : <Plus size={14} />}
            {showAddForm ? "Cancelar" : "Agregar"}
          </button>
        )}
      </div>

      {showAddForm && canManage && (
        <AddMemberForm onDone={() => { setShowAddForm(false); router.refresh(); }} />
      )}

      <div className="divide-y divide-slate-100 px-5">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            canManage={canManage}
            isSelf={member.userId === currentUserId}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      <div className="flex gap-2 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <span>Los permisos se aplican en el servidor según el rol de cada integrante. Solo el Dueño/a puede agregar, cambiar roles o activar/desactivar integrantes.</span>
      </div>
    </section>
  );
}

function AddMemberForm({ onDone }: { onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<AddTeamMemberValues, unknown, AddTeamMemberInput>({
    resolver: zodResolver(addTeamMemberSchema),
    defaultValues: { name: "", email: "", password: "", role: "RECEPTIONIST" },
  });

  const onSubmit = (data: AddTeamMemberInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await addTeamMember(data);
      if (!result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof AddTeamMemberValues, { message });
          }
        }
        return;
      }
      reset();
      onDone();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 border-b border-slate-100 bg-slate-50/60 p-5" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Nombre y apellido</label>
          <input className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400" placeholder="Julia Pérez" {...register("name")} />
          {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Correo</label>
          <input type="email" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400" placeholder="julia@clinica.com" {...register("email")} />
          {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Contraseña temporal</label>
          <input type="text" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400" placeholder="Mínimo 8 caracteres" {...register("password")} />
          {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
          <p className="mt-1 text-[11px] text-slate-400">Si el correo ya tiene una cuenta, se ignora y solo se agrega a esta clínica.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Rol</label>
          <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400" {...register("role")}>
            {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Agregar integrante
      </button>
    </form>
  );
}

function MemberRow({ member, canManage, isSelf, onChanged }: { member: Member; canManage: boolean; isSelf: boolean; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const initials = member.user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const canEditThisRow = canManage && !isSelf;

  const onRoleChange = (role: string) => {
    setError(null);
    startTransition(async () => {
      const result = await changeMemberRole({ memberId: member.id, role: role as AddTeamMemberInput["role"] });
      if (!result.ok) { setError(result.message); return; }
      onChanged();
    });
  };

  const onToggleActive = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleMemberActive({ memberId: member.id, active: !member.active });
      if (!result.ok) { setError(result.message); return; }
      onChanged();
    });
  };

  const onResetPassword = () => {
    setError(null);
    startTransition(async () => {
      const result = await resetMemberPassword({ memberId: member.id, newPassword: resetPassword });
      if (!result.ok) { setError(result.message); return; }
      setResetPassword("");
      setShowReset(false);
      setResetDone(true);
    });
  };

  return (
    <div className={`flex flex-col gap-2 py-4 ${member.active ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{member.user.name}{isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(vos)</span>}</p>
          <p className="truncate text-xs text-slate-500">{member.user.email}</p>
        </div>
        <div className="text-right">
          {canEditThisRow ? (
            <select
              value={member.role}
              disabled={isPending}
              onChange={(event) => onRoleChange(event.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none disabled:opacity-60"
            >
              {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : (
            <span className="block text-xs font-medium text-slate-600">{roleLabel(member.role)}</span>
          )}
          <span className={`mt-1 inline-flex items-center gap-1 text-[11px] ${member.active ? "text-emerald-600" : "text-slate-400"}`}>
            <span className={`size-1.5 rounded-full ${member.active ? "bg-emerald-500" : "bg-slate-300"}`} />
            {member.active ? "Activo" : "Inactivo"}
          </span>
        </div>
        {canEditThisRow && (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => { setShowReset((value) => !value); setResetDone(false); }}
              disabled={isPending}
              title="Resetear contraseña"
              className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
            >
              <KeyRound size={14} />
            </button>
            <button
              type="button"
              onClick={onToggleActive}
              disabled={isPending}
              title={member.active ? "Desactivar integrante" : "Activar integrante"}
              className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <UserCog size={14} />}
            </button>
          </div>
        )}
      </div>
      {showReset && canEditThisRow && (
        <div className="rounded-xl bg-slate-50 p-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">Nueva contraseña temporal para {member.user.name}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={onResetPassword}
              disabled={isPending || resetPassword.length < 8}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isPending && <Loader2 size={13} className="animate-spin" />}
              Guardar
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-slate-400">La persona entra con esta contraseña y puede cambiarla desde Configuración.</p>
        </div>
      )}
      {resetDone && (
        <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">Contraseña actualizada. Pasásela al integrante por un canal seguro.</p>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
