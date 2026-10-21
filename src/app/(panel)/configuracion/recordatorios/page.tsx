import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/queries/clinic";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getReminderRules } from "@/lib/queries/reminder-rules";
import { ReminderRulesForm } from "../reminder-rules-form";
import { ReminderTemplatesForm } from "../reminder-templates-form";

export default async function ConfiguracionRecordatoriosPage() {
  const session = await requireSession();
  const [clinic, rules] = await Promise.all([getClinicSettings(session.clinicId), getReminderRules(session.clinicId)]);
  if (!clinic) notFound();
  const canEdit = CLINIC_CONFIG_ROLES.includes(session.role);

  return (
    <div className="space-y-6">
      <ReminderRulesForm rules={rules} editable={canEdit} />
      <ReminderTemplatesForm
        clinicName={clinic.name}
        controlReminderTemplate={clinic.controlReminderTemplate}
        appointmentReminderTemplate={clinic.appointmentReminderTemplate}
        editable={canEdit}
      />
    </div>
  );
}
