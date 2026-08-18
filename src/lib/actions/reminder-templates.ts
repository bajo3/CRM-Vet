"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasRole } from "../auth/session";
import { CLINIC_CONFIG_ROLES } from "../auth/roles";
import { getPrisma } from "../prisma";
import { reminderTemplatesFormSchema, type ReminderTemplatesFormInput } from "../validation/reminder-templates";
import type { ActionResult } from "./types";

/** `""` (o solo espacios) significa "volver al texto por defecto" -> se guarda como `null`. */
function normalizeTemplate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Guarda los textos personalizados de los recordatorios automáticos por WhatsApp de la clínica. */
export async function updateReminderTemplates(input: ReminderTemplatesFormInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró." };
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return { ok: false, message: "No tenés permisos para modificar la clínica." };

  const parsed = reminderTemplatesFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisá los datos." };

  const prisma = getPrisma();
  await prisma.clinic.update({
    where: { id: session.clinicId },
    data: {
      controlReminderTemplate: normalizeTemplate(parsed.data.controlReminderTemplate),
      appointmentReminderTemplate: normalizeTemplate(parsed.data.appointmentReminderTemplate),
    },
  });

  revalidatePath("/configuracion");
  return { ok: true };
}
