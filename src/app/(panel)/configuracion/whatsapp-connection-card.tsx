"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, RefreshCw, WifiOff } from "lucide-react";

type ChannelState = {
  status: "CONNECTED" | "NOT_CONFIGURED" | "UNAVAILABLE";
  phoneNumber?: string | null;
  displayName?: string | null;
};

function formatPhone(value: string) {
  return value.startsWith("+") ? value : `+${value.replace(/\D/g, "")}`;
}

const STATUS_COPY: Record<ChannelState["status"], { label: string; detail: string; tone: string }> = {
  CONNECTED: { label: "WhatsApp conectado", detail: "El canal está listo para recibir y enviar mensajes.", tone: "bg-emerald-50 text-emerald-700" },
  NOT_CONFIGURED: { label: "Sin configurar", detail: "Todavía no hay un número de WhatsApp asociado a esta clínica.", tone: "bg-slate-100 text-slate-600" },
  UNAVAILABLE: {
    label: "Número desconectado",
    detail: "Meta reporta el número como desconectado. Los mensajes quedan en cola y se envían cuando se recupere; si sigue así, volvé a conectarlo.",
    tone: "bg-rose-50 text-rose-700",
  },
};

/** Estado del número oficial (Cloud API de Meta vía Zernio) de la clínica. */
export function WhatsappConnectionCard() {
  const [state, setState] = useState<ChannelState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const payload = (await response.json()) as Partial<ChannelState>;
      setState({ ...payload, status: payload.status && payload.status in STATUS_COPY ? payload.status : "UNAVAILABLE" });
    } catch {
      setState({ status: "UNAVAILABLE" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    // El estado del número en Meta cambia muy rara vez: no hace falta consultarlo seguido.
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const copy = state ? STATUS_COPY[state.status] : null;
  const connected = state?.status === "CONNECTED";

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
            <MessageCircle size={21} />
          </span>
          <div>
            <h2 className="font-semibold">Canal de WhatsApp</h2>
            <p className="text-sm text-slate-500">WhatsApp oficial de Meta, conectado vía Zernio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {copy && <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${copy.tone}`}>{copy.label}</span>}
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Actualizar estado"
            className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="space-y-5 p-5 lg:p-6">
        <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
          {!copy ? <Loader2 className="mt-0.5 animate-spin text-slate-400" size={20} /> : connected ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={20} /> : <WifiOff className="mt-0.5 text-slate-500" size={20} />}
          <div>
            <p className="text-sm font-medium">{copy?.label ?? "Consultando el estado…"}</p>
            {copy && <p className="mt-1 text-sm leading-5 text-slate-500">{copy.detail}</p>}
          </div>
        </div>

        {connected && state?.phoneNumber && (
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Número conectado</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatPhone(state.phoneNumber)}</p>
            {state.displayName && <p className="text-sm text-slate-500">{state.displayName}</p>}
            <p className="mt-2 text-xs leading-5 text-slate-500">Los mensajes del bot, del equipo y los recordatorios salen desde este número.</p>
          </div>
        )}
      </div>
    </section>
  );
}
