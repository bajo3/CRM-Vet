import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Sparkles } from "lucide-react";
import { getPrisma } from "@/lib/prisma";

type Step = { done: boolean; title: string; detail: string; href: string };

/**
 * Guía de primeros pasos para quien administra la clínica: con esto una veterinaria recién
 * registrada deja el sistema funcionando sola, sin ayuda de la plataforma. Desaparece cuando todos
 * los pasos están hechos.
 */
export async function SetupChecklist({ clinicId, welcome }: { clinicId: string; welcome: boolean }) {
  const prisma = getPrisma();
  const [clinic, memberCount, clientCount] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { phone: true, logoUrl: true, zernioAccountId: true, whatsappSessionKey: true },
    }),
    prisma.clinicMember.count({ where: { clinicId, active: true } }),
    prisma.client.count({ where: { clinicId } }),
  ]);
  if (!clinic) return null;

  const steps: Step[] = [
    {
      done: Boolean(clinic.zernioAccountId || clinic.whatsappSessionKey),
      title: "Conectá el WhatsApp de la veterinaria",
      detail: "Para que el bot reserve turnos solo y salgan los recordatorios.",
      href: "/configuracion#whatsapp",
    },
    {
      done: Boolean(clinic.phone && clinic.logoUrl),
      title: "Completá los datos y el logo de la clínica",
      detail: "Revisá también los horarios de atención: el bot ofrece turnos según ellos.",
      href: "/configuracion",
    },
    {
      done: memberCount > 1,
      title: "Sumá a tu equipo",
      detail: "Veterinarios y recepción, cada uno con su usuario y permisos.",
      href: "/configuracion",
    },
    {
      done: clientCount > 0,
      title: "Cargá tu primer cliente y su mascota",
      detail: "Los clientes que escriban por WhatsApp también se agregan solos.",
      href: "/clientes/nuevo",
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-emerald-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
            <Sparkles size={19} />
          </span>
          <div>
            <h2 className="font-semibold">{welcome ? "¡Listo! Tu clínica ya está activa" : "Terminá de configurar tu clínica"}</h2>
            <p className="text-sm text-slate-600">Seguí estos pasos y en unos minutos queda todo funcionando.</p>
          </div>
        </div>
        <p className="shrink-0 text-sm font-medium text-emerald-700">
          {completed} de {steps.length} listos
        </p>
      </div>
      <ol className="divide-y divide-slate-100">
        {steps.map((step) => (
          <li key={step.title}>
            <Link
              href={step.href}
              className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600"
            >
              {step.done ? (
                <CheckCircle2 size={20} className="shrink-0 text-emerald-600" aria-label="Hecho" />
              ) : (
                <Circle size={20} className="shrink-0 text-slate-300" aria-label="Pendiente" />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${step.done ? "text-slate-400 line-through" : "text-slate-900"}`}>{step.title}</span>
                {!step.done && <span className="block text-xs leading-5 text-slate-500">{step.detail}</span>}
              </span>
              {!step.done && <ChevronRight size={17} className="shrink-0 text-slate-400" />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
