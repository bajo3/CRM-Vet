"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CalendarClock, Loader2, Search, Send, X } from "lucide-react";
import { createScheduledMessage } from "@/lib/actions/scheduled-messages";
import {
  createScheduledMessageSchema,
  type CreateScheduledMessageInput,
  type CreateScheduledMessageValues,
} from "@/lib/validation/scheduled-messages";

type ClientOption = { id: string; name: string; phone: string; remindersEnabled: boolean };

function defaultDateTime() {
  const in20Days = new Date();
  in20Days.setDate(in20Days.getDate() + 20);
  const date = in20Days.toISOString().slice(0, 10);
  return { date, time: "09:00" };
}

export function ScheduleMessageForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ClientOption | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { date, time } = useMemo(() => defaultDateTime(), []);

  const {
    handleSubmit,
    control,
    register,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateScheduledMessageValues, unknown, CreateScheduledMessageInput>({
    resolver: zodResolver(createScheduledMessageSchema),
    defaultValues: { clientId: "", content: "", date, time },
  });

  const content = useWatch({ control, name: "content" }) ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 6);
    return clients.filter((client) => client.name.toLowerCase().includes(q) || client.phone.includes(q)).slice(0, 6);
  }, [clients, query]);

  function pick(client: ClientOption) {
    setSelected(client);
    setValue("clientId", client.id, { shouldValidate: true });
    setQuery("");
  }

  function clearClient() {
    setSelected(null);
    setValue("clientId", "", { shouldValidate: true });
  }

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    setSuccess(false);
    createScheduledMessage(data).then((result) => {
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setSuccess(true);
      clearClient();
      const next = defaultDateTime();
      reset({ clientId: "", content: "", date: next.date, time: next.time });
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" noValidate>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <CalendarClock size={16} className="text-emerald-600" />
        Programar mensaje
      </p>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Cliente</label>
        {selected ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
              <span className="truncate text-sm font-medium text-emerald-900">{selected.name}</span>
              <span className="truncate text-xs text-emerald-700">{selected.phone}</span>
              <button type="button" onClick={clearClient} className="ml-auto shrink-0 text-emerald-700 hover:text-emerald-900">
                <X size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscá al cliente por nombre o teléfono..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            {query.trim().length > 0 && (
              <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                {filtered.length === 0 ? (
                  <p className="p-3 text-sm text-slate-400">No encontramos ningún cliente.</p>
                ) : (
                  filtered.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => pick(client)}
                      className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50"
                    >
                      <span className="font-medium">{client.name}</span>
                      <span className="truncate text-xs text-slate-500">{client.phone}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        {errors.clientId && <p className="mt-1 text-xs text-rose-600">{errors.clientId.message}</p>}
        {selected && !selected.remindersEnabled && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={13} className="shrink-0" />
            Este cliente tiene los recordatorios desactivados. Programar igual va a enviarle este mensaje puntual.
          </p>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="content" className="mb-1.5 block text-sm font-medium text-slate-700">
          Mensaje
        </label>
        <textarea
          id="content"
          {...register("content")}
          maxLength={1000}
          rows={3}
          placeholder="Escribí el mensaje que se va a enviar por WhatsApp..."
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>{errors.content && <span className="text-rose-600">{errors.content.message}</span>}</span>
          <span>{content.length}/1000</span>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-slate-700">
            Fecha
          </label>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <input
                id="date"
                type="date"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
                name={field.name}
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
          {errors.date && <p className="mt-1 text-xs text-rose-600">{errors.date.message}</p>}
        </div>
        <div>
          <label htmlFor="time" className="mb-1.5 block text-sm font-medium text-slate-700">
            Horario
          </label>
          <Controller
            control={control}
            name="time"
            render={({ field }) => (
              <input
                id="time"
                type="time"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-400"
                name={field.name}
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
          {errors.time && <p className="mt-1 text-xs text-rose-600">{errors.time.message}</p>}
        </div>
      </div>

      {formError && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      {success && <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Mensaje programado correctamente.</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        Programar
      </button>
    </form>
  );
}
