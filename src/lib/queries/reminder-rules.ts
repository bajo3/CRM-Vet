import type { MedicalRecordType } from "@prisma/client";
import { getPrisma } from "../prisma";

/** Reglas de recordatorio automático configuradas por la clínica, indexadas por tipo de visita. */
export async function getReminderRules(clinicId: string): Promise<Partial<Record<MedicalRecordType, { months: number; enabled: boolean }>>> {
  const rules = await getPrisma().reminderRule.findMany({ where: { clinicId } });
  return Object.fromEntries(rules.map((rule) => [rule.type, { months: rule.months, enabled: rule.enabled }]));
}
