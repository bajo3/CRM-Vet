"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { setOnlineBooking } from "@/lib/actions/online-booking";

/** Activa la página pública de reserva y muestra el link para compartir (redes, Google, WhatsApp). */
export function OnlineBookingCard({ initialSlug, appUrl }: { initialSlug: string | null; appUrl: string }) {
  const [slug, setSlug] = useState(initialSlug);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = slug ? `${appUrl}/reservar/${slug}` : null;

  const toggle = (enabled: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setOnlineBooking(enabled);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSlug(result.slug);
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("No se pudo copiar. Seleccioná el link y copialo a mano.");
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
            <CalendarPlus size={21} />
          </span>
          <div>
            <h2 className="font-semibold">Reserva online</h2>
            <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">
              Una página pública donde tus clientes piden turno solos, según tus horarios de atención. Los turnos entran a la agenda como pendientes de confirmar.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggle(!slug)}
          disabled={isPending}
          className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60 ${
            slug ? "border border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          }`}
        >
          {isPending && <Loader2 size={15} className="animate-spin" />}
          {slug ? "Desactivar" : "Activar reserva online"}
        </button>
      </div>

      {link && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Link para compartir</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{link}</code>
            <button
              type="button"
              onClick={() => void copy()}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink size={15} />
              Abrir
            </a>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Si la desactivás, este link deja de funcionar; al volver a activarla se genera uno nuevo.</p>
        </div>
      )}
      {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
