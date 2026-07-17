import Link from "next/link";
import type { Metadata } from "next";
import {
  PawPrint,
  CalendarClock,
  Bot,
  BellRing,
  ClipboardList,
  FileText,
  Users,
  QrCode,
  UserPlus,
  Sparkles,
  ShieldCheck,
  Lock,
  Database,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Vet Simple | Recordatorios automáticos por WhatsApp para tu veterinaria",
  description:
    "Configurá tu clínica una vez y dejá que tus clientes reciban recordatorios automáticos por WhatsApp de vacunas, controles y turnos. Menos ausencias, más visitas recurrentes.",
};

const FEATURES = [
  {
    icon: CalendarClock,
    title: "Agenda con turnos por veterinario/a",
    description: "Organizá los turnos de todo el equipo en una agenda visual con arrastrar y soltar.",
  },
  {
    icon: Bot,
    title: "Bot de WhatsApp que agenda solo",
    description: "Tus clientes piden, confirman y reprograman turnos por WhatsApp sin que nadie del equipo tenga que escribir.",
  },
  {
    icon: BellRing,
    title: "Recordatorios automáticos configurables",
    description: "Vacunas, controles y turnos: definís las reglas una vez y el sistema le avisa a cada cliente en el momento justo.",
  },
  {
    icon: ClipboardList,
    title: "Historia clínica y fichas de mascotas",
    description: "Toda la información de cada paciente ordenada y a mano en cada consulta.",
  },
  {
    icon: FileText,
    title: "Presupuestos y recetas en PDF",
    description: "Generá documentos profesionales con el logo de tu clínica en segundos.",
  },
  {
    icon: Users,
    title: "Equipo con roles y permisos",
    description: "Sumá a todo el equipo con el nivel de acceso que le corresponde a cada uno/a.",
  },
];

const STEPS = [
  {
    icon: UserPlus,
    title: "Registrás tu clínica",
    description: "Completás el alta en un par de minutos.",
  },
  {
    icon: QrCode,
    title: "Vinculás el WhatsApp de la veterinaria",
    description: "Escaneás un código QR una sola vez y listo.",
  },
  {
    icon: Sparkles,
    title: "Cargás tus clientes",
    description: "El sistema se encarga de avisarles solo, sin que tengas que hacer seguimiento manual.",
  },
];

const TRUST_POINTS = [
  {
    icon: Database,
    title: "Datos aislados por clínica",
    description: "La información de tu veterinaria está separada de la de cualquier otra clínica que use Vet Simple.",
  },
  {
    icon: ShieldCheck,
    title: "Permisos aplicados en el servidor",
    description: "Cada rol del equipo ve y hace solo lo que le corresponde, verificado en cada acción, no solo en la pantalla.",
  },
  {
    icon: Lock,
    title: "Tus datos son tuyos",
    description: "Podés pedir tu información cuando quieras. No la usamos para nada que no sea operar tu clínica.",
  },
];

export default function BienvenidaPage() {
  return (
    <main className="bg-[#f6f8f5] text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-7 lg:px-10">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
            <PawPrint size={18} />
          </span>
          <span className="font-semibold">Vet Simple</span>
        </div>
        <Link
          href="/login"
          className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Iniciar sesión
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-7 sm:py-20 lg:px-10">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
          <Bot size={14} />
          Recordatorios automáticos por WhatsApp
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Configurá tu clínica una vez. Los recordatorios por WhatsApp se mandan solos.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          Vet Simple avisa a tus clientes de vacunas, controles y turnos por WhatsApp sin que nadie del equipo tenga que
          acordarse. Menos ausencias, más visitas recurrentes.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/registro"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700 sm:w-auto"
          >
            Registrá tu clínica
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 sm:w-auto"
          >
            Iniciar sesión
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-7 lg:px-10">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Todo lo que necesita tu veterinaria</h2>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">Una sola herramienta para la agenda, los clientes y la comunicación por WhatsApp.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <feature.icon size={20} />
              </div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-7 lg:px-10">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cómo funciona</h2>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">Tres pasos y tu clínica queda funcionando.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <article key={step.title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="mb-4 inline-flex size-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
                <step.icon size={20} />
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Confianza */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-7 lg:px-10">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pensado para que confíes en tus datos</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="text-center sm:text-left">
                <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 sm:mx-0">
                  <point.icon size={20} />
                </div>
                <h3 className="font-semibold">{point.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-500">{point.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-7 sm:py-20 lg:px-10">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">¿Lista para dejar de mandar recordatorios a mano?</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
          Registrá tu clínica hoy. El alta pasa por una aprobación rápida de nuestro equipo antes de activarse.
        </p>
        <div className="mt-7 flex justify-center">
          <Link
            href="/registro"
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700"
          >
            Registrá tu clínica
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-600 text-white">
              <PawPrint size={14} />
            </span>
            <span>Vet Simple</span>
          </div>
          <p>© {new Date().getFullYear()} Vet Simple. Hecho para veterinarias.</p>
        </div>
      </footer>
    </main>
  );
}
