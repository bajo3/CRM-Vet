import { BadgeCheck, ExternalLink } from "lucide-react";

const RESULT_COPY: Record<string, { tone: string; text: string }> = {
  connected: { tone: "bg-emerald-50 text-emerald-700", text: "WhatsApp oficial conectado. Desde ahora los mensajes salen por la API de Meta." },
  cancelled: { tone: "bg-amber-50 text-amber-700", text: "Se canceló la conexión antes de terminar. Podés reintentarlo." },
  mismatch: { tone: "bg-rose-50 text-rose-700", text: "La conexión no correspondía a esta clínica; no se guardó nada." },
  error: { tone: "bg-rose-50 text-rose-700", text: "No se pudo completar la conexión. Probá de nuevo en unos minutos." },
};

// Conexión al WhatsApp oficial (Cloud API de Meta, vía Zernio) en modo coexistencia: la veterinaria
// sigue usando la app de WhatsApp Business en el teléfono y el CRM envía y recibe por la API.
// Una vez conectada, esta vía reemplaza al dispositivo vinculado por QR (ver tarjeta de arriba).
export function ZernioWhatsappCard({ connected, result }: { connected: boolean; result?: string }) {
  const resultCopy = result ? RESULT_COPY[result] : undefined;
  if (connected && !resultCopy) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {resultCopy && <p className={`mb-4 rounded-xl px-3 py-2 text-sm font-medium ${resultCopy.tone}`}>{resultCopy.text}</p>}
      {!connected && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <BadgeCheck size={20} />
            </span>
            <div>
              <h2 className="font-semibold">Pasar a WhatsApp oficial</h2>
              <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">
                Conectá el número de la veterinaria a la API oficial de Meta. Es más estable, no depende de tener el teléfono
                encendido y seguís usando la app de WhatsApp Business como siempre.
              </p>
            </div>
          </div>
          <a
            href="/api/whatsapp/zernio/connect"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Conectar WhatsApp oficial <ExternalLink size={15} />
          </a>
        </div>
      )}
    </section>
  );
}
