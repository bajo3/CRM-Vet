import { Building2, ShieldCheck, UsersRound } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { roleLabel } from "@/lib/format";
import { ClinicForm } from "./clinic-form";
import { WhatsappConnectionCard } from "./whatsapp-connection-card";

export default async function ConfiguracionPage() {
  const session = await requireSession();
  const canEdit = CLINIC_CONFIG_ROLES.includes(session.role);
  const [clinic, members] = await Promise.all([
    getPrisma().clinic.findUniqueOrThrow({ where: { id: session.clinicId } }),
    getPrisma().clinicMember.findMany({
      where: { clinicId: session.clinicId },
      include: { user: true },
      orderBy: [{ active: "desc" }, { role: "asc" }, { user: { name: "asc" } }],
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Building2 size={16} />
            Administración
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Configuración</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Gestioná la clínica, los horarios de atención, el equipo y la conexión de WhatsApp desde un solo lugar.</p>
        </div>
        <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
          {canEdit ? "Podés editar" : "Acceso de solo lectura"}
        </span>
      </header>

      {canEdit && <WhatsappConnectionCard />}

      <div className="grid items-start gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <ClinicForm
          clinic={{
            name: clinic.name,
            phone: clinic.phone ?? "",
            timezone: clinic.timezone,
            duration: clinic.defaultAppointmentDuration,
            openingHours: clinic.openingHours,
          }}
          editable={canEdit}
        />

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 p-5">
            <span className="grid size-10 place-items-center rounded-2xl bg-violet-50 text-violet-600"><UsersRound size={19} /></span>
            <div><h2 className="font-semibold">Equipo</h2><p className="text-xs text-slate-500">{members.filter((member) => member.active).length} integrantes activos</p></div>
          </div>
          <div className="divide-y divide-slate-100 px-5">
            {members.map(({ id, role, active, user }) => {
              const initials = user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
              return (
                <div key={id} className={`flex items-center gap-3 py-4 ${active ? "" : "opacity-50"}`}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
                  <div className="text-right"><span className="block text-xs font-medium text-slate-600">{roleLabel(role)}</span><span className={`mt-1 inline-flex items-center gap-1 text-[11px] ${active ? "text-emerald-600" : "text-slate-400"}`}><span className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`} />{active ? "Activo" : "Inactivo"}</span></div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" /><span>Los permisos se aplican en el servidor según el rol de cada integrante.</span></div>
        </section>
      </div>
    </div>
  );
}
