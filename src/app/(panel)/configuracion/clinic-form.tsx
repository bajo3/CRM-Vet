"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock3, Loader2, Save } from "lucide-react";
import { updateClinic } from "@/lib/actions/clinic";

const DAYS = [
  ["monday", "Lunes"], ["tuesday", "Martes"], ["wednesday", "Miércoles"],
  ["thursday", "Jueves"], ["friday", "Viernes"], ["saturday", "Sábado"], ["sunday", "Domingo"],
] as const;

type ClinicFormProps = {
  clinic: { name: string; phone: string; timezone: string; duration: number; openingHours: unknown };
  editable: boolean;
};

const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50";

export function ClinicForm({ clinic, editable }: ClinicFormProps) {
  const hours = clinic.openingHours as Record<string, string[]>;
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      action={(formData) => startTransition(async () => {
        setResult(null);
        const days = Object.fromEntries(DAYS.map(([key]) => [key, {
          enabled: formData.get(`${key}-enabled`) === "on",
          open: String(formData.get(`${key}-open`)),
          close: String(formData.get(`${key}-close`)),
        }]));
        const response = await updateClinic({
          name: String(formData.get("name")),
          phone: String(formData.get("phone")),
          timezone: String(formData.get("timezone")),
          defaultAppointmentDuration: Number(formData.get("duration")),
          days,
        });
        setResult({ ok: response.ok, message: response.ok ? "Cambios guardados correctamente." : response.message });
      })}
    >
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <span className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Clock3 size={19} /></span>
        <div><h2 className="font-semibold">Clínica y agenda</h2><p className="text-xs text-slate-500">Datos que usa el panel para organizar los turnos</p></div>
      </div>

      <fieldset disabled={!editable || pending} className="space-y-6 p-5 disabled:opacity-70 lg:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Nombre de la clínica<input name="name" defaultValue={clinic.name} required className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">Teléfono<input name="phone" type="tel" defaultValue={clinic.phone} className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">Zona horaria<input name="timezone" defaultValue={clinic.timezone} className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">Duración de cada turno<input name="duration" type="number" min="10" max="180" step="5" defaultValue={clinic.duration} className={inputClass} /><span className="mt-1 block text-xs font-normal text-slate-400">Entre 10 y 180 minutos</span></label>
        </div>

        <div>
          <div className="mb-3"><p className="text-sm font-semibold text-slate-800">Horarios de atención</p><p className="mt-1 text-xs text-slate-500">Desactivá los días en los que la clínica permanece cerrada.</p></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            {DAYS.map(([key, label]) => {
              const value = hours[key] ?? ["09:00", "18:00"];
              return (
                <div key={key} className="grid gap-3 border-b border-slate-100 p-3 last:border-b-0 sm:grid-cols-[1fr_130px_16px_130px] sm:items-center sm:px-4">
                  <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" name={`${key}-enabled`} defaultChecked={Boolean(hours[key])} className="size-4 rounded accent-emerald-600" />{label}</label>
                  <input aria-label={`Apertura ${label}`} name={`${key}-open`} type="time" defaultValue={value[0]} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
                  <span className="hidden text-center text-xs text-slate-400 sm:block">a</span>
                  <input aria-label={`Cierre ${label}`} name={`${key}-close`} type="time" defaultValue={value[1]} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
                </div>
              );
            })}
          </div>
        </div>

        {result && <div role="status" className={`flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{result.ok && <CheckCircle2 size={17} />}{result.message}</div>}

        {editable && <div className="flex justify-end"><button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">{pending ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}{pending ? "Guardando..." : "Guardar cambios"}</button></div>}
      </fieldset>
    </form>
  );
}
