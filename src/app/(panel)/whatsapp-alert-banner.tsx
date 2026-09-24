"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircleOff } from "lucide-react";

const POLL_MS = 60_000;
// Estados que sí o sí requieren acción humana (re-escanear el QR): se avisan al primer chequeo.
const ACTION_NEEDED = new Set(["WAITING_QR", "LOGGED_OUT"]);

/**
 * Banner de alerta visible en todo el panel cuando el canal de WhatsApp está caído: sin esto, el
 * bridge podía pasar horas desconectado sin que nadie en la clínica se enterara. Consulta el mismo
 * endpoint que la tarjeta de Configuración; para roles sin permiso (403) no se muestra nada.
 * Los estados transitorios (reconectando, etc.) esperan dos chequeos seguidos para no parpadear.
 */
export function WhatsappAlertBanner() {
  const [status, setStatus] = useState<string | null>(null);
  const [strikes, setStrikes] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 403) {
          setStatus(null);
          setStrikes(0);
          return;
        }
        const payload = (await response.json().catch(() => null)) as { status?: string } | null;
        const nextStatus = payload?.status ?? "UNAVAILABLE";
        setStatus(nextStatus);
        setStrikes((prev) => (nextStatus === "CONNECTED" ? 0 : Math.min(prev + 1, 10)));
      } catch {
        if (cancelled) return;
        setStatus("UNAVAILABLE");
        setStrikes((prev) => Math.min(prev + 1, 10));
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Clínica que todavía no conectó ningún WhatsApp (recién registrada): invitación, no alarma.
  if (status === "NOT_CONFIGURED") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-7">
        <MessageCircleOff size={16} className="shrink-0" />
        <span className="min-w-0 flex-1">Todavía no conectaste el WhatsApp de la veterinaria: el bot y los recordatorios no van a salir.</span>
        <Link href="/configuracion#whatsapp" className="shrink-0 font-semibold underline underline-offset-2 hover:text-amber-950">
          Conectarlo ahora
        </Link>
      </div>
    );
  }

  const show = status !== null && status !== "CONNECTED" && (ACTION_NEEDED.has(status) || strikes >= 2);
  if (!show) return null;

  const needsQr = ACTION_NEEDED.has(status);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 sm:px-7">
      <MessageCircleOff size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {needsQr
          ? "WhatsApp está desvinculado: el bot y los recordatorios automáticos no están saliendo."
          : "El canal de WhatsApp no responde: los mensajes automáticos pueden estar demorados."}
      </span>
      <Link href="/configuracion" className="shrink-0 font-semibold underline underline-offset-2 hover:text-rose-900">
        {needsQr ? "Escanear el QR" : "Ver estado"}
      </Link>
    </div>
  );
}
