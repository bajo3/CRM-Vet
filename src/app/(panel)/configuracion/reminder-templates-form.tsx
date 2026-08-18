"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, MessageSquareText, RotateCcw, Save } from "lucide-react";
import { updateReminderTemplates } from "@/lib/actions/reminder-templates";
import {
  DEFAULT_APPOINTMENT_REMINDER_TEMPLATE,
  DEFAULT_CONTROL_REMINDER_TEMPLATE,
  REMINDER_TEMPLATE_PLACEHOLDERS,
  getReminderTemplateSampleValues,
  renderReminderTemplate,
  type ReminderTemplateKind,
} from "@/lib/services/reminder-templates";

type ReminderTemplatesFormProps = {
  clinicName: string;
  controlReminderTemplate: string | null;
  appointmentReminderTemplate: string | null;
  editable: boolean;
};

const textareaClass =
  "w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50";

function TemplateEditor({
  kind,
  title,
  description,
  value,
  defaultTemplate,
  clinicName,
  editable,
  onChange,
  onReset,
}: {
  kind: ReminderTemplateKind;
  title: string;
  description: string;
  value: string;
  defaultTemplate: string;
  clinicName: string;
  editable: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const placeholders = REMINDER_TEMPLATE_PLACEHOLDERS[kind];
  const preview = useMemo(() => {
    const effectiveTemplate = value.trim().length > 0 ? value : defaultTemplate;
    return renderReminderTemplate(effectiveTemplate, getReminderTemplateSampleValues(kind, clinicName));
  }, [value, defaultTemplate, clinicName, kind]);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        {editable && value.trim().length > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw size={12} />
            Restaurar texto original
          </button>
        )}
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!editable}
        maxLength={500}
        rows={3}
        placeholder={defaultTemplate}
        className={textareaClass}
      />
      <div className="flex justify-end text-xs text-slate-400">
        <span>{value.length}/500</span>
      </div>

      <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
        <p className="mb-1.5 font-medium text-slate-600">Placeholders disponibles</p>
        <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {placeholders.map((placeholder) => (
            <li key={placeholder.key}>
              <code className="rounded bg-white px-1 py-0.5 font-mono text-emerald-700">{`{${placeholder.key}}`}</code> {placeholder.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-3.5 py-3">
        <p className="mb-1 text-xs font-medium text-emerald-700">Vista previa (con datos de ejemplo)</p>
        <p className="text-sm leading-5 text-slate-700">{preview}</p>
      </div>
    </div>
  );
}

export function ReminderTemplatesForm({ clinicName, controlReminderTemplate, appointmentReminderTemplate, editable }: ReminderTemplatesFormProps) {
  const [control, setControl] = useState(controlReminderTemplate ?? "");
  const [appointment, setAppointment] = useState(appointmentReminderTemplate ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setResult(null);
    startTransition(async () => {
      const response = await updateReminderTemplates({ controlReminderTemplate: control, appointmentReminderTemplate: appointment });
      setResult({ ok: response.ok, message: response.ok ? "Cambios guardados correctamente." : response.message });
    });
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <span className="grid size-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <MessageSquareText size={19} />
        </span>
        <div>
          <h2 className="font-semibold">Texto de los mensajes automáticos</h2>
          <p className="text-xs text-slate-500">
            Editá exactamente lo que le llega al cliente por WhatsApp. Si dejás el campo vacío, se usa el texto original.
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5 lg:p-6">
        <TemplateEditor
          kind="CONTROL_DUE"
          title="Recordatorio de control"
          description="Se envía 7 días y 1 día antes de la fecha del próximo control de la mascota."
          value={control}
          defaultTemplate={DEFAULT_CONTROL_REMINDER_TEMPLATE}
          clinicName={clinicName}
          editable={editable}
          onChange={setControl}
          onReset={() => setControl("")}
        />

        <TemplateEditor
          kind="APPOINTMENT_REMINDER"
          title="Recordatorio de turno"
          description="Se envía 24 horas antes del turno agendado."
          value={appointment}
          defaultTemplate={DEFAULT_APPOINTMENT_REMINDER_TEMPLATE}
          clinicName={clinicName}
          editable={editable}
          onChange={setAppointment}
          onReset={() => setAppointment("")}
        />

        {result && (
          <div role="status" className={`flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {result.ok && <CheckCircle2 size={17} />}
            {result.message}
          </div>
        )}

        {editable && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              {pending ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
