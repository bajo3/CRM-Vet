import { requireRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES } from "@/lib/auth/roles";
import { listClientsForSelect } from "@/lib/queries/clients";
import { PetForm } from "../pet-form";

export default async function NuevaMascotaPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const session = await requireRole(CLIENT_MANAGE_ROLES);
  const { clientId } = await searchParams;
  const clients = await listClientsForSelect(session.clinicId);

  return (
    <section className="mx-auto max-w-lg px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Nueva mascota</h1>
      <p className="mb-6 text-sm text-slate-500">Cargá los datos básicos. Podés completar el resto más adelante.</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {clients.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no hay clientes cargados. Creá primero un cliente para poder asignarle una mascota.
          </p>
        ) : (
          <PetForm mode="create" clients={clients} defaultValues={{ clientId }} />
        )}
      </div>
    </section>
  );
}
