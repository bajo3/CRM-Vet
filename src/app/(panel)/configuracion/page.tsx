import { requireSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { ClinicForm } from "./clinic-form";

export default async function ConfiguracionPage() {
  const session = await requireSession();
  const [clinic, members] = await Promise.all([
    getPrisma().clinic.findUniqueOrThrow({ where: { id: session.clinicId } }),
    getPrisma().clinicMember.findMany({ where: { clinicId: session.clinicId, active: true }, include: { user: true }, orderBy: { role: "asc" } }),
  ]);
  return <div className="mx-auto max-w-5xl space-y-6 p-4 py-6 lg:p-8"><div><h1 className="text-2xl font-semibold">Configuracion</h1><p className="text-sm text-slate-500">Datos operativos, agenda y equipo de la clinica.</p></div><ClinicForm clinic={{ name: clinic.name, phone: clinic.phone ?? "", timezone: clinic.timezone, duration: clinic.defaultAppointmentDuration, openingHours: clinic.openingHours }} editable={CLINIC_CONFIG_ROLES.includes(session.role)} /><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Equipo</h2><div className="mt-4 divide-y divide-slate-100">{members.map(({ id, role, user }) => <div key={id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium">{user.name}</p><p className="text-xs text-slate-500">{user.email}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{role}</span></div>)}</div></section></div>;
}


