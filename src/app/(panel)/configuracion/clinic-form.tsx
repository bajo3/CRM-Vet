"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Clock3, Loader2, Save, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { updateClinic } from "@/lib/actions/clinic";
import { resizeImageToDataUrl } from "@/lib/image-resize";

const DAYS = [
  ["monday", "Lunes"], ["tuesday", "Martes"], ["wednesday", "Miércoles"],
  ["thursday", "Jueves"], ["friday", "Viernes"], ["saturday", "Sábado"], ["sunday", "Domingo"],
] as const;

type ClinicFormProps = {
  clinic: { name: string; phone: string; timezone: string; duration: number; openingHours: unknown; logoUrl: string | null };
  editable: boolean;
};

const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50";
const LOGO_MAX_SIDE = 320;

/** Normaliza tanto el formato viejo (`[open, close]`) como el nuevo (lista de rangos) a lista de rangos. */
function normalizeRanges(raw: unknown): [string, string][] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return typeof raw[0] === "string" ? [raw as [string, string]] : (raw as [string, string][]);
}

export function ClinicForm({ clinic, editable }: ClinicFormProps) {
  const hours = clinic.openingHours as Record<string, unknown>;
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [split, setSplit] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DAYS.map(([key]) => [key, normalizeRanges(hours[key]).length > 1]))
  );
  const [logoDataUrl, setLogoDataUrl] = useState(clinic.logoUrl ?? "");
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    try {
      setLogoDataUrl(await resizeImageToDataUrl(file, LOGO_MAX_SIDE));
    } catch {
      setLogoError("No se pudo procesar la imagen. Probá con otro archivo.");
    }
  }

  return (
    <form
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      action={(formData) => startTransition(async () => {
        setResult(null);
        const days = Object.fromEntries(DAYS.map(([key]) => [key, {
          enabled: formData.get(`${key}-enabled`) === "on",
          open: String(formData.get(`${key}-open`)),
          close: String(formData.get(`${key}-close`)),
          splitEnabled: formData.get(`${key}-split`) === "on",
          open2: String(formData.get(`${key}-open2`) || "00:00"),
          close2: String(formData.get(`${key}-close2`) || "00:00"),
        }]));
        const response = await updateClinic({
          name: String(formData.get("name")),
          phone: String(formData.get("phone")),
          timezone: String(formData.get("timezone")),
          defaultAppointmentDuration: Number(formData.get("duration")),
          logoUrl: logoDataUrl,
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
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Logo de la clínica</p>
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDataUrl} alt="Logo de la clínica" className="size-full object-contain" />
              ) : (
                <ImageIcon size={22} className="text-slate-300" />
              )}
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Upload size={13} />
                {logoDataUrl ? "Cambiar" : "Subir logo"}
              </button>
              {logoDataUrl && (
                <button type="button" onClick={() => { setLogoDataUrl(""); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50">
                  <Trash2 size={13} />
                  Quitar
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} className="hidden" />
            </div>
          </div>
          {logoError && <p className="mt-1.5 text-xs text-rose-600">{logoError}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Nombre de la clínica<input name="name" defaultValue={clinic.name} required className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">Teléfono<input name="phone" type="tel" defaultValue={clinic.phone} className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">Zona horaria<input name="timezone" defaultValue={clinic.timezone} className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">Duración de cada turno<input name="duration" type="number" min="10" max="180" step="5" defaultValue={clinic.duration} className={inputClass} /><span className="mt-1 block text-xs font-normal text-slate-400">Entre 10 y 180 minutos</span></label>
        </div>

        <div>
          <div className="mb-3"><p className="text-sm font-semibold text-slate-800">Horarios de atención</p><p className="mt-1 text-xs text-slate-500">Desactivá los días en los que la clínica permanece cerrada. Si cerrás al mediodía, sumá un segundo turno.</p></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            {DAYS.map(([key, label]) => {
              const ranges = normalizeRanges(hours[key]);
              const [firstOpen, firstClose] = ranges[0] ?? ["09:00", "18:00"];
              const [secondOpen, secondClose] = ranges[1] ?? ["16:00", "20:00"];
              return (
                <div key={key} className="space-y-2 border-b border-slate-100 p-3 last:border-b-0 sm:px-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_130px_16px_130px] sm:items-center">
                    <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" name={`${key}-enabled`} defaultChecked={ranges.length > 0} className="size-4 rounded accent-emerald-600" />{label}</label>
                    <input aria-label={`Apertura ${label}`} name={`${key}-open`} type="time" defaultValue={firstOpen} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
                    <span className="hidden text-center text-xs text-slate-400 sm:block">a</span>
                    <input aria-label={`Cierre ${label}`} name={`${key}-close`} type="time" defaultValue={firstClose} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
                  </div>
                  <label className="flex items-center gap-2 pl-7 text-xs font-medium text-slate-500">
                    <input
                      type="checkbox"
                      name={`${key}-split`}
                      checked={split[key] ?? false}
                      onChange={(event) => setSplit((current) => ({ ...current, [key]: event.target.checked }))}
                      className="size-3.5 rounded accent-emerald-600"
                    />
                    Segundo turno (ej. horario cortado)
                  </label>
                  {split[key] && (
                    <div className="grid gap-3 pl-7 sm:grid-cols-[1fr_130px_16px_130px] sm:items-center">
                      <span />
                      <input aria-label={`Apertura turno tarde ${label}`} name={`${key}-open2`} type="time" defaultValue={secondOpen} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
                      <span className="hidden text-center text-xs text-slate-400 sm:block">a</span>
                      <input aria-label={`Cierre turno tarde ${label}`} name={`${key}-close2`} type="time" defaultValue={secondClose} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
                    </div>
                  )}
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
