import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, Pencil, Phone, PawPrint, Stethoscope, Weight, Receipt, FileText, FolderOpen } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES, AGENDA_MANAGE_ROLES, PRESCRIPTION_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getPetDetail } from "@/lib/queries/pet";
import { getReminderRules } from "@/lib/queries/reminder-rules";
import { ageFromBirthDate, formatDate, formatDateShort, formatTime, medicalRecordTypeLabel } from "@/lib/format";
import { SpeciesIcon } from "@/lib/pet-species-icon";
import { RegisterVisitPanel } from "./register-visit-panel";
import { QuotePanel } from "./quote-panel";
import { PrescriptionPanel } from "./prescription-panel";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value);
}

export default async function FichaMascotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const session = await requireSession();
  const { petId } = await params;
  const { ok } = await searchParams;

  const [clinic, detail, reminderRules] = await Promise.all([
    getClinicSettings(session.clinicId),
    getPetDetail(session.clinicId, petId),
    getReminderRules(session.clinicId),
  ]);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  if (!detail) notFound();
  const { pet, medicalRecords, nextAppointment, nextControlRecord, lastVisit, lastKnownWeight, quotes, prescriptions } = detail;

  const canManage = hasRole(session, CLIENT_MANAGE_ROLES);
  const canCreateAppointment = hasRole(session, AGENDA_MANAGE_ROLES);
  const canCreatePrescription = hasRole(session, PRESCRIPTION_ROLES);

  const documents = [
    ...quotes.map((quote) => ({
      kind: "quote" as const,
      id: quote.id,
      createdAt: quote.createdAt,
      userName: quote.user.name,
      title: quote.title,
      total: Number(quote.total),
    })),
    ...prescriptions.map((prescription) => ({
      kind: "prescription" as const,
      id: prescription.id,
      createdAt: prescription.createdAt,
      userName: prescription.user.name,
      content: prescription.content,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const age = pet.birthDate ? ageFromBirthDate(pet.birthDate, timezone) : pet.approximateAge ?? "Edad no registrada";
  const weightLabel = lastKnownWeight ? `${Number(lastKnownWeight).toLocaleString("es-AR")} kg` : "Sin registrar";

  return (
    <section className="mx-auto max-w-4xl px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <Link href="/clientes" className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} />
        Clientes y mascotas
      </Link>

      {ok && <div className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{ok}</div>}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {pet.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pet.photoUrl} alt={pet.name} className="size-16 rounded-2xl object-cover" />
            ) : (
              <span className="grid size-16 place-items-center rounded-2xl bg-emerald-100 text-2xl font-semibold text-emerald-800">
                {pet.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold">
                {pet.name}
                <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <SpeciesIcon species={pet.species} size={13} />
                </span>
              </h1>
              <p className="text-sm text-slate-500">
                {pet.species}
                {pet.breed ? ` · ${pet.breed}` : ""} · {age}
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <Weight size={13} />
                {weightLabel}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-4 py-3 text-sm sm:items-end">
            <Link href={`/clientes?q=${encodeURIComponent(pet.client.phone)}`} className="font-medium text-emerald-700 hover:underline">
              {pet.client.name}
            </Link>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Phone size={13} />
              {pet.client.phone}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Próximo turno</div>
            <div className="mt-1 text-sm text-slate-700">
              {nextAppointment ? (
                <Link href={`/agenda/${nextAppointment.id}`} className="font-medium text-emerald-700 hover:underline">
                  {formatDateShort(nextAppointment.startAt, timezone)} · {formatTime(nextAppointment.startAt, timezone)}
                </Link>
              ) : (
                "Sin turno agendado"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Próximo control</div>
            <div className="mt-1 text-sm text-slate-700">
              {nextControlRecord?.nextDueDate ? formatDateShort(nextControlRecord.nextDueDate, timezone) : "Sin control pendiente"}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Última visita</div>
            <div className="mt-1 text-sm text-slate-700">{lastVisit ? formatDateShort(lastVisit.createdAt, timezone) : "Sin visitas registradas"}</div>
          </div>
        </div>

        {pet.notes && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-medium">Observaciones: </span>
            {pet.notes}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          {canCreateAppointment ? (
            <Link
              href={`/agenda/nuevo?petId=${pet.id}`}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <CalendarDays size={16} />
              Nuevo turno
            </Link>
          ) : (
            <span
              title="Sólo recepción/administración pueden agendar turnos"
              className="flex h-10 cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-400"
            >
              <CalendarDays size={16} />
              Nuevo turno
            </span>
          )}
          {canManage && (
            <Link
              href={`/clientes/mascotas/${pet.id}/editar`}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Pencil size={16} />
              Editar mascota
            </Link>
          )}
          <a
            href="#nuevo-presupuesto"
            className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Receipt size={16} />
            Nuevo presupuesto
          </a>
          {canCreatePrescription && (
            <a
              href="#nueva-receta"
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <FileText size={16} />
              Nueva receta
            </a>
          )}
        </div>
      </div>

      <div className="mb-6">
        <RegisterVisitPanel petId={pet.id} reminderRules={reminderRules} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div id="nuevo-presupuesto">
          <QuotePanel petId={pet.id} />
        </div>
        {canCreatePrescription && (
          <div id="nueva-receta">
            <PrescriptionPanel petId={pet.id} />
          </div>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-5">
          <Stethoscope size={18} className="text-emerald-600" />
          <h2 className="font-semibold">Historial</h2>
        </div>
        {medicalRecords.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <PawPrint size={28} className="text-slate-300" />
            <p className="text-sm text-slate-500">Todavía no hay atenciones registradas para {pet.name}.</p>
          </div>
        ) : (
          <ol className="divide-y divide-slate-100">
            {medicalRecords.map((record) => (
              <li key={record.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{formatDate(record.createdAt, timezone)}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{medicalRecordTypeLabel(record.type)}</span>
                </div>
                <p className="mt-2 font-medium">{record.reason}</p>
                {record.notes && <p className="mt-1 text-sm text-slate-600">{record.notes}</p>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {record.weight && <span>Peso: {Number(record.weight).toLocaleString("es-AR")} kg</span>}
                  {record.treatment && <span>Vacuna/tratamiento: {record.treatment}</span>}
                  {record.nextDueDate && <span>Próximo control: {formatDateShort(record.nextDueDate, timezone)}</span>}
                </div>
                <p className="mt-2 text-xs text-slate-400">Registrado por: {record.user.name}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-5">
          <FolderOpen size={18} className="text-emerald-600" />
          <h2 className="font-semibold">Presupuestos y recetas</h2>
        </div>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <FolderOpen size={28} className="text-slate-300" />
            <p className="text-sm text-slate-500">Todavía no se generaron presupuestos ni recetas para {pet.name}.</p>
          </div>
        ) : (
          <ol className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <li key={`${doc.kind}-${doc.id}`} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        doc.kind === "quote" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {doc.kind === "quote" ? "Presupuesto" : "Receta"}
                    </span>
                    <span className="text-sm font-medium">{formatDate(doc.createdAt, timezone)}</span>
                  </div>
                  <p className="mt-1.5 truncate text-sm text-slate-700">
                    {doc.kind === "quote"
                      ? doc.title || "Sin título"
                      : doc.content.length > 90
                        ? `${doc.content.slice(0, 90)}…`
                        : doc.content}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {doc.kind === "quote" && (
                      <>
                        Total: <span className="font-medium text-slate-600">{formatCurrency(doc.total)}</span> ·{" "}
                      </>
                    )}
                    Emitido por: {doc.userName}
                  </p>
                </div>
                <a
                  href={`/api/documents/${doc.kind === "quote" ? "quotes" : "prescriptions"}/${doc.id}/pdf`}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Descargar PDF
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
