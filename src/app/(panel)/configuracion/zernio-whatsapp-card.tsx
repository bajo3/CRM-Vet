import { ExternalLink, MessageCircle } from "lucide-react";

const RESULT_COPY: Record<string, { tone: string; text: string }> = {
  connected: { tone: "bg-emerald-50 text-emerald-700", text: "¡Listo! Tu WhatsApp quedó conectado. El bot y los recordatorios ya salen desde tu número." },
  cancelled: { tone: "bg-amber-50 text-amber-700", text: "Se canceló la conexión antes de terminar. Podés reintentarlo cuando quieras." },
  mismatch: { tone: "bg-rose-50 text-rose-700", text: "La conexión no correspondía a esta clínica; no se guardó nada." },
  error: { tone: "bg-rose-50 text-rose-700", text: "No se pudo completar la conexión. Probá de nuevo en unos minutos." },
};

const STEPS = [
  "Tocá el botón y entrá con la cuenta de Facebook que administra el negocio (si no tenés, se crea en el momento).",
  "Elegí el número de WhatsApp Business de la veterinaria y confirmá con el código que te llega.",
  "Escaneá el código que te muestra Meta desde la app de WhatsApp Business del teléfono. Seguís usándola como siempre.",
];

// Conexión al WhatsApp oficial (Cloud API de Meta, vía Zernio) en modo coexistencia: la veterinaria
// sigue usando la app de WhatsApp Business en el teléfono y el CRM envía y recibe por la API. Es la vía
// de autoservicio: la clínica la completa sola, sin que el equipo de la plataforma intervenga.
export function ZernioWhatsappCard({ connected, result }: { connected: boolean; result?: string }) {
  const resultCopy = result ? RESULT_COPY[result] : undefined;
  if (connected && !resultCopy) return null;

  return (
    <section id="whatsapp" className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      {resultCopy && <p className={`mb-4 rounded-xl px-3 py-2 text-sm font-medium ${resultCopy.tone}`}>{resultCopy.text}</p>}
      {!connected && (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
                <MessageCircle size={21} />
              </span>
              <div>
                <h2 className="font-semibold">Conectá el WhatsApp de tu veterinaria</h2>
                <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">
                  Con esto el bot responde y reserva turnos solo, y los recordatorios salen desde tu número. Lleva unos 5 minutos.
                </p>
              </div>
            </div>
            <a
              href="/api/whatsapp/zernio/connect"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Conectar WhatsApp <ExternalLink size={15} />
            </a>
          </div>
          <ol className="mt-5 space-y-3 border-t border-slate-100 pt-5 text-sm text-slate-600">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">{index + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
