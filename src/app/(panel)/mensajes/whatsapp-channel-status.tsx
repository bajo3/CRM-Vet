"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Loader2, Wifi, WifiOff } from "lucide-react";

type Status = "STARTING" | "WAITING_QR" | "CONNECTED" | "RECONNECTING" | "LOGGED_OUT" | "NOT_CONFIGURED" | "UNAVAILABLE";

export function WhatsappChannelStatus() {
  const [status, setStatus] = useState<Status>("STARTING");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/status?summary=1", { cache: "no-store" });
      const payload = (await response.json()) as { status?: Status };
      setStatus(payload.status ?? "UNAVAILABLE");
    } catch {
      setStatus("UNAVAILABLE");
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  if (status === "CONNECTED") {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><Wifi size={12} />WhatsApp conectado</span>;
  }
  if (["STARTING", "RECONNECTING"].includes(status)) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"><Loader2 size={12} className="animate-spin" />Reconectando</span>;
  }
  const needsLink = status === "WAITING_QR" || status === "LOGGED_OUT";
  return <span title={needsLink ? "Hay que volver a vincular el dispositivo desde Configuración" : "Los mensajes quedarán en cola hasta recuperar la conexión"} className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">{needsLink ? <CircleAlert size={12} /> : <WifiOff size={12} />}{needsLink ? "Requiere vinculación" : "WhatsApp sin conexión"}</span>;
}
