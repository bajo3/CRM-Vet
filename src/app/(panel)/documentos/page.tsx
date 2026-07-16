import Link from "next/link";
import { FileText, FolderOpen, Receipt, Search } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { PRESCRIPTION_ROLES } from "@/lib/auth/roles";
import { listClinicDocuments } from "@/lib/queries/documents";
import { getClinicSettings } from "@/lib/queries/clinic";
import { listPetsForAppointmentForm } from "@/lib/queries/agenda";
import { formatDate } from "@/lib/format";
import { QuickCreate } from "./quick-create";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value);
}

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession();
  const { q = "" } = await searchParams;
  const [documents, clinic, pets] = await Promise.all([
    listClinicDocuments(session.clinicId, q),
    getClinicSettings(session.clinicId),
    listPetsForAppointmentForm(session.clinicId),
  ]);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const petOptions = pets.map((pet) => ({ id: pet.id, name: pet.name, species: pet.species, clientName: pet.client.name, clientPhone: pet.client.phone }));

  return (
    <section className="px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="mt-1 text-sm text-slate-500">Presupuestos y recetas generados, de todos los clientes.</p>
      </header>

      <QuickCreate pets={petOptions} canCreatePrescription={hasRole(session, PRESCRIPTION_ROLES)} />

      <form className="mb-6 flex h-12 max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <Search size={18} className="text-slate-400" />
        <input
          name="q"
          defaultValue={q}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Buscar por cliente o mascota"
        />
      </form>

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <FolderOpen size={26} />
          </span>
          <p className="font-medium text-slate-700">{q ? "No encontramos resultados." : "Todavía no se generaron presupuestos ni recetas."}</p>
          <p className="mt-1 text-sm text-slate-500">{q ? "Probá con otro nombre de cliente o mascota." : "Se van a listar acá apenas se generen desde la ficha de una mascota."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Link
              key={`${doc.kind}-${doc.id}`}
              href={`/clientes/mascotas/${doc.petId}`}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/30 sm:p-5"
            >
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${doc.kind === "quote" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"}`}>
                {doc.kind === "quote" ? <Receipt size={19} /> : <FileText size={19} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{doc.kind === "quote" ? doc.title || "Presupuesto" : "Receta"}</span>
                  <span className="text-xs text-slate-400">{formatDate(doc.createdAt, timezone)}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {doc.petName} · {doc.clientName}
                </p>
                {doc.kind === "quote" ? (
                  <p className="mt-1 text-sm font-medium text-slate-700">{formatCurrency(doc.total)}</p>
                ) : (
                  <p className="mt-1 truncate text-sm text-slate-600">{doc.content}</p>
                )}
              </div>
              <span className="hidden shrink-0 text-xs text-slate-400 sm:block">Emitido por {doc.userName}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
