"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronDown, Clock3, Loader2, MessageCircle, Smartphone, UserRound, XCircle } from "lucide-react";

const CONNECT_URL = "/api/whatsapp/zernio/connect";

type ResultCopy = { tone: "success" | "warning" | "error"; title: string; text: string; retry: boolean };

const RESULT_COPY: Record<string, ResultCopy> = {
  connected: {
    tone: "success",
    title: "¡Listo! Tu WhatsApp quedó conectado",
    text: "El bot y los recordatorios ya salen desde tu número. Seguís usando la app del teléfono como siempre.",
    retry: false,
  },
  cancelled: {
    tone: "warning",
    title: "La conexión quedó a mitad de camino",
    text: "Se cerró la ventana de Meta antes de terminar. No pasa nada: tocá el botón y retomás desde el principio.",
    retry: true,
  },
  mismatch: {
    tone: "error",
    title: "Ese WhatsApp no se pudo asociar a esta clínica",
    text: "Puede que ese número ya esté conectado a otra cuenta o que la conexión se haya iniciado desde otra pestaña. Probá de nuevo desde acá.",
    retry: true,
  },
  error: {
    tone: "error",
    title: "No se pudo completar la conexión",
    text: "Suele ser algo momentáneo. Esperá un par de minutos y volvé a intentarlo; si se repite, revisá la ayuda de más abajo.",
    retry: true,
  },
  demo: {
    tone: "warning",
    title: "En la cuenta demo no se conecta un WhatsApp real",
    text: "Registrá tu clínica y vas a poder conectar tu propio número en unos minutos.",
    retry: false,
  },
};

const TONE_STYLES: Record<ResultCopy["tone"], { box: string; icon: typeof CheckCircle2 }> = {
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  error: { box: "border-rose-200 bg-rose-50 text-rose-900", icon: XCircle },
};

const REQUIREMENTS = [
  { icon: Smartphone, title: "El celular de la veterinaria", text: "Con la app WhatsApp Business abierta y el número que usan con los clientes." },
  { icon: UserRound, title: "Una cuenta de Facebook", text: "Sirve la personal de quien administra el negocio. Meta la pide para crear la cuenta de empresa." },
  { icon: Clock3, title: "Unos 5 minutos", text: "Sin cortar la atención: los chats y contactos del teléfono no se tocan." },
];

const STEPS = [
  { title: "Entrá con Facebook", text: "Se abre una ventana de Meta. Iniciá sesión y aceptá los permisos. Si te pide crear un portfolio de empresa, poné el nombre de la veterinaria." },
  { title: "Elegí tu número", text: "Elegí la opción para conectar la app de WhatsApp Business que ya usás y escribí el número de la veterinaria." },
  { title: "Confirmá desde el teléfono", text: "Te llega un aviso o un código QR en WhatsApp Business. Aceptalo desde el celular y listo: volvés solo a esta pantalla." },
];

const FAQ = [
  {
    question: "Uso WhatsApp común, no WhatsApp Business",
    answer:
      "Descargá WhatsApp Business en el mismo celular y registrá ahí el número de la veterinaria: la app ofrece pasar los chats automáticamente. Después volvé acá y conectalo.",
  },
  {
    question: "¿Pierdo los chats o dejo de poder usar el teléfono?",
    answer: "No. Seguís respondiendo desde la app como siempre; el sistema solo se suma para el bot y los recordatorios. Lo que contestes desde el teléfono también aparece en Mensajes.",
  },
  {
    question: "Meta dice que el número no es elegible",
    answer:
      "Pasa cuando el número es muy nuevo en WhatsApp Business o tuvo poco uso. Usalo unos días desde la app con normalidad y volvé a intentarlo.",
  },
  {
    question: "No me aparece el aviso en el teléfono",
    answer: "Actualizá WhatsApp Business desde la tienda de apps, abrila y dejala en primer plano mientras terminás los pasos en la computadora.",
  },
];

// Asistente de conexión al WhatsApp oficial (Cloud API de Meta, vía Zernio) en modo coexistencia: la
// veterinaria sigue usando la app de WhatsApp Business en el teléfono y el CRM envía y recibe por la API.
// Es autoservicio: la clínica lo completa sola, sin que el equipo de la plataforma intervenga.
export function ZernioWhatsappCard({ connected, result }: { connected: boolean; result?: string }) {
  const [opening, setOpening] = useState(false);

  // Si vuelve con "Atrás" desde Meta, el navegador restaura la página tal cual: el botón no puede quedar trabado.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setOpening(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const resultCopy = result ? RESULT_COPY[result] : undefined;
  if (connected && !resultCopy) return null;

  const resultBanner = resultCopy && <ResultBanner copy={resultCopy} />;

  if (connected) {
    return (
      <section id="whatsapp" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
        {resultBanner}
      </section>
    );
  }

  const failed = resultCopy?.retry ?? false;
  const isDemo = result === "demo";

  return (
    <section id="whatsapp" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
        <div className="flex items-start gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#25d366] text-white shadow-sm shadow-emerald-200">
            <MessageCircle size={21} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Paso clave</p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight">Conectá el WhatsApp de tu veterinaria</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
              Con esto el bot responde y reserva turnos solo, y los recordatorios salen desde tu número. Seguís usando WhatsApp Business en el
              celular como siempre.
            </p>
          </div>
        </div>
        {!isDemo && <ConnectButton opening={opening} onOpen={() => setOpening(true)} label={failed ? "Intentar de nuevo" : "Conectar WhatsApp"} />}
      </div>

      {resultBanner && <div className="px-5 lg:px-6">{resultBanner}</div>}

      <div className="grid gap-px border-t border-slate-100 bg-slate-100 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-white p-5 lg:p-6">
          <h3 className="text-sm font-semibold text-slate-900">Antes de empezar, tené a mano</h3>
          <ul className="mt-4 space-y-3.5">
            {REQUIREMENTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <item.icon size={16} />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white p-5 lg:p-6">
          <h3 className="text-sm font-semibold text-slate-900">Qué vas a ver</h3>
          <ol className="relative mt-4 space-y-5">
            <span className="absolute bottom-3 left-[13px] top-3 w-px bg-slate-200" aria-hidden />
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative flex gap-3.5">
                <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-emerald-700 ring-2 ring-emerald-200">
                  {index + 1}
                </span>
                <div className="pt-0.5">
                  <p className="text-sm font-medium text-slate-800">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{step.text}</p>
                </div>
              </li>
            ))}
            <li className="relative flex gap-3.5">
              <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                <Check size={14} strokeWidth={3} />
              </span>
              <p className="pt-1 text-sm font-medium text-emerald-800">WhatsApp conectado: el bot y los recordatorios empiezan a funcionar.</p>
            </li>
          </ol>
        </div>
      </div>

      <div className="border-t border-slate-100 p-5 lg:px-6">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">¿Algo no sale como esperabas?</h3>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {FAQ.map((item) => (
            <details key={item.question} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown size={16} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-3.5 text-sm leading-6 text-slate-500">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectButton({ opening, onOpen, label }: { opening: boolean; onOpen: () => void; label: string }) {
  return (
    <a
      href={CONNECT_URL}
      onClick={(event) => {
        if (opening) {
          event.preventDefault();
          return;
        }
        onOpen();
      }}
      aria-disabled={opening}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 aria-disabled:cursor-wait aria-disabled:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
    >
      {opening ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Abriendo Meta…
        </>
      ) : (
        <>
          {label}
          <ArrowRight size={16} />
        </>
      )}
    </a>
  );
}

function ResultBanner({ copy }: { copy: ResultCopy }) {
  const style = TONE_STYLES[copy.tone];
  return (
    <div role="status" className={`mb-5 flex gap-3 rounded-xl border px-4 py-3 ${style.box}`}>
      <style.icon size={19} className="mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-0.5 text-sm leading-5 opacity-90">{copy.text}</p>
      </div>
    </div>
  );
}
