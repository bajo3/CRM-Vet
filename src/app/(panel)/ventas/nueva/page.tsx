import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listPetsForAppointmentForm } from "@/lib/queries/agenda";
import { listProducts } from "@/lib/services/sales";
import { listPendingCharges } from "@/lib/services/pending-charges";
import { getClinicSettings } from "@/lib/queries/clinic";
import { formatDateShort } from "@/lib/format";
import { SaleForm } from "./sale-form";

export default async function NuevaVentaPage({ searchParams }: { searchParams: Promise<{ petId?: string }> }) {
  const session = await requireSession();
  const { petId } = await searchParams;
  const [products, pets, clinic] = await Promise.all([listProducts(session.clinicId, true), listPetsForAppointmentForm(session.clinicId), getClinicSettings(session.clinicId)]);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const initialPetId = pets.some((pet) => pet.id === petId) ? petId! : "";
  // Si la mascota tiene turnos atendidos o productos usados sin cobrar, la venta arranca con eso cargado.
  const pending = initialPetId ? (await listPendingCharges(session.clinicId, initialPetId))[0] : undefined;

  return (
    <section className="mx-auto max-w-3xl px-4 py-5 sm:px-7 lg:py-8">
      <Link href="/ventas" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} />
        Ventas y caja
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Nueva venta</h1>
      <SaleForm
        products={products}
        pets={pets.map((pet) => ({ id: pet.id, label: `${pet.name} · ${pet.client.name}` }))}
        initialPetId={initialPetId}
        pendingUsages={pending?.usages ?? []}
        pendingAppointments={(pending?.appointments ?? []).map((row) => ({ id: row.id, label: `${row.reason} · ${formatDateShort(row.startAt, timezone)}` }))}
      />
    </section>
  );
}
