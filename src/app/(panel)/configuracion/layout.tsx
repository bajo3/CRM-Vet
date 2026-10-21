import { requireSession } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { ConfigTabs } from "./config-tabs";

// Cada tema de configuración tiene su solapa: clínica, WhatsApp, recordatorios, reserva online,
// equipo y la cuenta personal. Antes convivían todos en una sola página larga.
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const canEdit = CLINIC_CONFIG_ROLES.includes(session.role);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          {canEdit ? "Podés editar" : "Acceso de solo lectura"}
        </span>
      </header>
      <ConfigTabs canEdit={canEdit} />
      {children}
    </div>
  );
}
