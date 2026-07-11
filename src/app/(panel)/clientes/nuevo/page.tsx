import { requireRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES } from "@/lib/auth/roles";
import { ClientForm } from "../client-form";

export default async function NuevoClientePage() {
  await requireRole(CLIENT_MANAGE_ROLES);

  return (
    <section className="mx-auto max-w-lg px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Nuevo cliente</h1>
      <p className="mb-6 text-sm text-slate-500">Cargá los datos del tutor. Podés agregar sus mascotas después.</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <ClientForm mode="create" />
      </div>
    </section>
  );
}
