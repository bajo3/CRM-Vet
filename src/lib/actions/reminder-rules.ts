"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasRole } from "../auth/session";
import { CLINIC_CONFIG_ROLES } from "../auth/roles";
import { getPrisma } from "../prisma";
import { reminderRulesFormSchema, type ReminderRulesFormInput } from "../validation/reminder-rules";
import type { ActionResult } from "./types";

/** Guarda, por tipo de visita, cada cuántos meses sugerir el próximo control al registrar una atención de ese tipo. */
export async function updateReminderRules(input: ReminderRulesFormInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró." };
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return { ok: false, message: "No tenés permisos para modificar la clínica." };

  const parsed = reminderRulesFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisá los datos." };

  const prisma = getPrisma();
  await prisma.$transaction(
    parsed.data.rules.map((rule) =>
      prisma.reminderRule.upsert({
        where: { clinicId_type: { clinicId: session.clinicId, type: rule.type } },
        create: { clinicId: session.clinicId, type: rule.type, months: rule.months, enabled: rule.enabled },
        update: { months: rule.months, enabled: rule.enabled },
      })
    )
  );

  revalidatePath("/configuracion");
  return { ok: true };
}
