import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";
import { getClinicSettings } from "@/lib/queries/clinic";
import { CLINIC_CONFIG_ROLES, TEAM_MANAGE_ROLES } from "@/lib/auth/roles";
import { getReminderRules } from "@/lib/queries/reminder-rules";
import { ClinicForm } from "./clinic-form";
import { WhatsappConnectionCard } from "./whatsapp-connection-card";
import { TeamPanel } from "./team-panel";
import { AccountPanel } from "./account-panel";
import { ReminderRulesForm } from "./reminder-rules-form";

export default async function ConfiguracionPage() {
  const session = await requireSession();
  const canEdit = CLINIC_CONFIG_ROLES.includes(session.role);
  const canManageTeam = TEAM_MANAGE_ROLES.includes(session.role);
  const [clinic, members, reminderRules] = await Promise.all([
    getClinicSettings(session.clinicId),
    getPrisma().clinicMember.findMany({
      where: { clinicId: session.clinicId },
      select: { id: true, userId: true, role: true, active: true, user: { select: { name: true, email: true } } },
      orderBy: [{ active: "desc" }, { role: "asc" }, { user: { name: "asc" } }],
    }),
    getReminderRules(session.clinicId),
  ]);
  if (!clinic) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Building2 size={16} />
            Administración
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Configuración</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Gestioná la clínica, los horarios de atención, el equipo, la conexión de WhatsApp y los recordatorios automáticos desde un solo lugar.</p>
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
            logoUrl: clinic.logoUrl,
          }}
          editable={canEdit}
        />

        <div className="space-y-6">
          <TeamPanel members={members} canManage={canManageTeam} currentUserId={session.userId} />
          <AccountPanel />
        </div>
      </div>

      <ReminderRulesForm rules={reminderRules} editable={canEdit} />
    </div>
  );
}
