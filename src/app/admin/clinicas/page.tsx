import { requireSuperAdmin } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";
import { AdminAccountPanel } from "../account-panel";
import { DecidedClinicRow, PendingClinicRow } from "./clinics-panel";

export default async function AdminClinicasPage() {
  await requireSuperAdmin();

  const clinics = await getPrisma().clinic.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      statusReason: true,
      createdAt: true,
      members: { where: { role: "OWNER" }, take: 1, select: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = clinics.map((clinic) => ({
    id: clinic.id,
    name: clinic.name,
    phone: clinic.phone,
    status: clinic.status,
    statusReason: clinic.statusReason,
    createdAt: clinic.createdAt.toISOString(),
    ownerName: clinic.members[0]?.user.name ?? null,
    ownerEmail: clinic.members[0]?.user.email ?? null,
  }));

  const pending = rows.filter((row) => row.status === "PENDING");
  const decided = rows.filter((row) => row.status !== "PENDING");

  return (
    <div className="mx-auto max-w-4xl space-y-7 px-4 py-6 sm:px-7 lg:py-9">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clínicas</h1>
        <p className="mt-1 text-sm text-slate-500">Altas nuevas pendientes de revisión y el historial de aprobadas/rechazadas.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Pendientes ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            No hay altas esperando revisión.
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((clinic) => (
              <PendingClinicRow key={clinic.id} clinic={clinic} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Historial ({decided.length})</h2>
        {decided.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Todavía no hay nada acá.</p>
        ) : (
          <div className="space-y-3">
            {decided.map((clinic) => (
              <DecidedClinicRow key={clinic.id} clinic={clinic} />
            ))}
          </div>
        )}
      </section>

      <AdminAccountPanel />
    </div>
  );
}
