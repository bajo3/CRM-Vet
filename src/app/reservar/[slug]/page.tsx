import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PawPrint } from "lucide-react";
import { DateTime } from "luxon";
import { getBookingClinic, ONLINE_BOOKING_MAX_DAYS_AHEAD } from "@/lib/services/online-booking";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const clinic = await getBookingClinic(slug);
  return { title: clinic ? `Reservar turno | ${clinic.name}` : "Reservar turno" };
}

// Página pública (sin sesión) para pedir turno en una clínica que activó la reserva online desde
// Configuración. Solo muestra el nombre, el logo y los horarios libres: ningún dato de clientes.
export default async function ReservarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clinic = await getBookingClinic(slug);
  if (!clinic) notFound();

  const today = DateTime.now().setZone(clinic.timezone).startOf("day");

  return (
    <main className="flex min-h-screen justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- el logo es una URL/data URI subida por la clínica
            <img src={clinic.logoUrl} alt={`Logo de ${clinic.name}`} className="size-16 rounded-2xl bg-white object-contain shadow-sm" />
          ) : (
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm shadow-brand-200">
              <PawPrint size={28} />
            </span>
          )}
          <div>
            <h1 className="text-lg font-bold tracking-tight">{clinic.name}</h1>
            <p className="text-sm text-slate-500">Reservá tu turno online</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <BookingForm slug={slug} minDate={today.toISODate()!} maxDate={today.plus({ days: ONLINE_BOOKING_MAX_DAYS_AHEAD }).toISODate()!} />
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">Reservas gestionadas con Vet Simple</p>
      </div>
    </main>
  );
}
