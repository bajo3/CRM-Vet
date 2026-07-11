import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";
import { listClientsForSelect } from "@/lib/queries/clients";
import { PetForm } from "../../pet-form";

export default async function EditarMascotaPage({ params }: { params: Promise<{ petId: string }> }) {
  const session = await requireRole(CLIENT_MANAGE_ROLES);
  const { petId } = await params;

  const prisma = getPrisma();
  const [pet, clients] = await Promise.all([
    prisma.pet.findFirst({ where: { id: petId, clinicId: session.clinicId } }),
    listClientsForSelect(session.clinicId),
  ]);
  if (!pet) notFound();

  return (
    <section className="mx-auto max-w-lg px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Editar mascota</h1>
      <p className="mb-6 text-sm text-slate-500">Actualizá los datos de {pet.name}.</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <PetForm
          mode="edit"
          petId={pet.id}
          clients={clients}
          defaultValues={{
            name: pet.name,
            species: pet.species,
            clientId: pet.clientId,
            photoUrl: pet.photoUrl ?? "",
            breed: pet.breed ?? "",
            sex: pet.sex ?? "",
            birthDate: pet.birthDate ? pet.birthDate.toISOString().slice(0, 10) : "",
            approximateAge: pet.approximateAge ?? "",
            weight: pet.weight ? Number(pet.weight) : undefined,
            notes: pet.notes ?? "",
          }}
        />
      </div>
    </section>
  );
}
