import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { AGENDA_MANAGE_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";
import { getActiveVeterinarians, listPetsForAppointmentForm } from "@/lib/queries/agenda";
import { todayISO } from "@/lib/services/agenda-schedule";
import { AppointmentForm } from "./appointment-form";

type SearchParams = { petId?: string; date?: string; time?: string; vetId?: string };

export default async function NuevoTurnoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireRole(AGENDA_MANAGE_ROLES, "/agenda");
  const params = await searchParams;

  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({ where: { id: session.clinicId } });
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";

  const [pets, vets] = await Promise.all([listPetsForAppointmentForm(session.clinicId), getActiveVeterinarians(session.clinicId)]);

  const preselectedPet = params.petId ? pets.find((pet) => pet.id === params.petId) : undefined;

  return (
    <section className="mx-auto max-w-2xl px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <Link href="/agenda" className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} />
        Agenda
      </Link>

      <h1 className="mb-6 text-xl font-semibold">Nuevo turno</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <AppointmentForm
          pets={pets.map((pet) => ({ id: pet.id, name: pet.name, species: pet.species, clientName: pet.client.name, clientPhone: pet.client.phone }))}
          vets={vets}
          defaultValues={{
            petId: preselectedPet?.id ?? "",
            veterinarianId: params.vetId ?? "",
            reason: "",
            date: params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayISO(timezone),
            time: params.time ?? "",
          }}
        />
      </div>
    </section>
  );
}
