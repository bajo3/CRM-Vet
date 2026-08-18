import { CheckCircle2, ExternalLink, Radio } from "lucide-react";

const RESULT_COPY: Record<string, { tone: string; text: string }> = {
  connected: { tone: "bg-emerald-50 text-emerald-700", text: "WhatsApp conectado con éxito vía Zernio." },
  cancelled: { tone: "bg-amber-50 text-amber-700", text: "Se canceló la conexión antes de terminar. Podés reintentarlo." },
  mismatch: { tone: "bg-rose-50 text-rose-700", text: "La conexión no correspondía a esta clínica; no se guardó nada." },
  error: { tone: "bg-rose-50 text-rose-700", text: "No se pudo completar la conexión con Zernio." },
};

// Piloto: ruta alternativa de conexión de WhatsApp vía Zernio (WhatsApp Business Cloud API en
// modo coexistencia), en paralelo al bridge de Baileys de arriba mientras se valida la migración.
export function ZernioWhatsappCard({ connected, result }: { connected: boolean; result?: string }) {
  const resultCopy = result ? RESULT_COPY[result] : undefined;

  return (
    <section className="overflow-hidden rounded-3xl border border-dashed border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
          <Radio size={20} />
        </span>
        <div>
          <h2 className="font-semibold">WhatsApp oficial (beta) — vía Zernio</h2>
          <p className="text-sm text-slate-500">Meta Cloud API en modo coexistencia, sin reemplazar el número vinculado arriba.</p>
        </div>
      </div>

      {resultCopy && <p className={`mt-4 rounded-xl px-3 py-2 text-sm font-medium ${resultCopy.tone}`}>{resultCopy.text}</p>}

      <div className="mt-4 flex items-center gap-3">
        {connected ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={16} /> Cuenta conectada
          </span>
        ) : (
          <a
            href="/api/whatsapp/zernio/connect"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Conectar WhatsApp con Zernio <ExternalLink size={15} />
          </a>
        )}
      </div>
    </section>
  );
}
