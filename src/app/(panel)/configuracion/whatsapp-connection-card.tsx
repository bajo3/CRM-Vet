"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, RefreshCw, Smartphone, WifiOff } from "lucide-react";

type BridgeState = {
  status: "STARTING" | "WAITING_QR" | "CONNECTED" | "RECONNECTING" | "LOGGED_OUT" | "NOT_CONFIGURED" | "UNAVAILABLE";
  qrDataUrl?: string | null;
};

const STATUS_COPY: Record<BridgeState["status"], { label: string; detail: string; tone: string }> = {
  STARTING: { label: "Iniciando", detail: "El bridge se está preparando.", tone: "bg-amber-50 text-amber-700" },
  WAITING_QR: { label: "Esperando vinculación", detail: "Escaneá el código con el teléfono de la veterinaria.", tone: "bg-blue-50 text-blue-700" },
  CONNECTED: { label: "WhatsApp conectado", detail: "El canal está listo para recibir y enviar mensajes.", tone: "bg-emerald-50 text-emerald-700" },
  RECONNECTING: { label: "Reconectando", detail: "Estamos recuperando la conexión automáticamente.", tone: "bg-amber-50 text-amber-700" },
  LOGGED_OUT: { label: "Sesión cerrada", detail: "Vinculá el dispositivo nuevamente para continuar.", tone: "bg-rose-50 text-rose-700" },
  NOT_CONFIGURED: { label: "Sin configurar", detail: "Falta asociar el bridge a esta instalación.", tone: "bg-slate-100 text-slate-600" },
  UNAVAILABLE: { label: "Sin respuesta", detail: "El bridge no está disponible en este momento.", tone: "bg-rose-50 text-rose-700" },
};

export function WhatsappConnectionCard() {
  const [state, setState] = useState<BridgeState>({ status: "STARTING" });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const payload = (await response.json()) as BridgeState;
      setState(payload);
    } catch {
      setState({ status: "UNAVAILABLE" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const copy = STATUS_COPY[state.status];
  const connected = state.status === "CONNECTED";

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
            <MessageCircle size={21} />
          </span>
          <div>
            <h2 className="font-semibold">Canal de WhatsApp</h2>
            <p className="text-sm text-slate-500">Conexión del número de la veterinaria</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${copy.tone}`}>{copy.label}</span>
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

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto] lg:p-6">
        <div className="space-y-5">
          <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
            {loading ? <Loader2 className="mt-0.5 animate-spin text-slate-400" size={20} /> : connected ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={20} /> : <WifiOff className="mt-0.5 text-slate-500" size={20} />}
            <div>
              <p className="text-sm font-medium">{copy.label}</p>
              <p className="mt-1 text-sm leading-5 text-slate-500">{copy.detail}</p>
            </div>
          </div>

          {!connected && (
            <div>
              <p className="text-sm font-semibold text-slate-800">Cómo vincularlo</p>
              <ol className="mt-3 space-y-3 text-sm text-slate-600">
                {["Abrí WhatsApp en el teléfono de la veterinaria.", "Entrá a Dispositivos vinculados y tocá Vincular dispositivo.", "Escaneá el código que aparece a la derecha."].map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">{index + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs leading-5 text-slate-400">El QR se renueva automáticamente. La sesión queda guardada en Railway después de vincular el dispositivo.</p>
            </div>
          )}
        </div>

        <div className="flex min-h-64 min-w-64 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4">
          {state.qrDataUrl ? (
            <Image src={state.qrDataUrl} width={280} height={280} unoptimized alt="Código QR para vincular WhatsApp" className="rounded-2xl bg-white p-2 shadow-sm" />
          ) : connected ? (
            <div className="max-w-52 text-center"><CheckCircle2 size={48} className="mx-auto text-emerald-600" /><p className="mt-3 text-sm font-semibold">Dispositivo vinculado</p><p className="mt-1 text-xs text-slate-500">No necesitás escanear ningún código.</p></div>
          ) : (
            <div className="max-w-52 text-center"><Smartphone size={44} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-600">Preparando el código QR</p><p className="mt-1 text-xs text-slate-400">Puede demorar unos segundos.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}
