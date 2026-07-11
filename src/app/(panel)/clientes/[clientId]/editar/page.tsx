import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";
import { ClientForm } from "../../client-form";

export default async function EditarClientePage({ params }: { params: Promise<{ clientId: string }> }) {
  const session = await requireRole(CLIENT_MANAGE_ROLES);
  const { clientId } = await params;

  const prisma = getPrisma();
  const client = await prisma.client.findFirst({ where: { id: clientId, clinicId: session.clinicId } });
  if (!client) notFound();

  return (
    <section className="mx-auto max-w-lg px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Editar cliente</h1>
      <p className="mb-6 text-sm text-slate-500">Actualizá los datos de {client.name}.</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <ClientForm
          mode="edit"
          clientId={client.id}
          defaultValues={{
            name: client.name,
            phone: client.phone,
            email: client.email ?? "",
            address: client.address ?? "",
            remindersEnabled: client.remindersEnabled,
          }}
        />
      </div>
    </section>
  );
}
