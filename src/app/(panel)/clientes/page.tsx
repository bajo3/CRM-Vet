import Link from "next/link";
import { Pencil, Phone, Plus, Search, UsersRound } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES } from "@/lib/auth/roles";
import { searchClients } from "@/lib/queries/clients";
import { SpeciesIcon } from "@/lib/pet-species-icon";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string }> }) {
  const session = await requireSession();
  const { q = "", ok } = await searchParams;
  const clients = await searchClients(session.clinicId, q);
  const canManage = hasRole(session, CLIENT_MANAGE_ROLES);

  return (
    <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      {ok && <div className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{ok}</div>}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes y mascotas</h1>
        {canManage && (
          <Link
            href="/clientes/nuevo"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm shadow-emerald-200"
          >
            <Plus size={17} />
            Nuevo cliente
          </Link>
        )}
      </header>

      <form className="mb-6 flex h-12 max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <Search size={18} className="text-slate-400" />
        <input
          name="q"
          defaultValue={q}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Buscar por cliente, mascota o teléfono"
        />
      </form>

      {clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <UsersRound size={26} />
          </span>
          <p className="font-medium text-slate-700">{q ? "No encontramos resultados." : "Todavía no hay clientes cargados."}</p>
          <p className="mt-1 text-sm text-slate-500">
            {q ? "Probá con otro nombre, mascota o teléfono." : canManage ? "Empezá creando el primer cliente." : "Pedile a recepción que cargue el primer cliente."}
          </p>
          {canManage && !q && (
            <Link href="/clientes/nuevo" className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white">
              Nuevo cliente
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <article key={client.id} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/30 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{client.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <Phone size={13} />
                    {client.phone}
                  </div>
                </div>
                {canManage && (
                  <Link
                    href={`/clientes/${client.id}/editar`}
                    className="relative z-10 flex h-9 w-fit items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Pencil size={13} />
                    Editar
                  </Link>
                )}
              </div>
              <div className="relative z-10 mt-3 flex flex-wrap gap-2">
                {client.pets.length === 0 ? (
                  <span className="text-xs text-slate-400">Sin mascotas registradas</span>
                ) : (
                  client.pets.map((pet) => (
                    <Link
                      key={pet.id}
                      href={`/clientes/mascotas/${pet.id}`}
                      className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                    >
                      <SpeciesIcon species={pet.species} />
                      {pet.name} · {pet.species}
                    </Link>
                  ))
                )}
                {canManage && (
                  <Link
                    href={`/clientes/mascotas/nueva?clientId=${client.id}`}
                    className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                  >
                    + Mascota
                  </Link>
                )}
              </div>
              {canManage && (
                <Link href={`/clientes/${client.id}/editar`} className="absolute inset-0 z-0 rounded-2xl" aria-label={`Ver ${client.name}`} />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
