"use server";
import { revalidatePath } from "next/cache";
import { getSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getPrisma } from "@/lib/prisma";
import { clinicFormSchema, type ClinicFormInput } from "@/lib/validation/clinic";
import type { ActionResult } from "./types";

export async function updateClinic(input: ClinicFormInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesion expiro." };
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return { ok: false, message: "No tenes permisos para modificar la clinica." };
  const parsed = clinicFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const openingHours = Object.fromEntries(Object.entries(parsed.data.days).filter(([, day]) => day.enabled).map(([key, day]) => [key, [day.open, day.close]]));
  await getPrisma().clinic.updateMany({ where: { id: session.clinicId }, data: { name: parsed.data.name, phone: parsed.data.phone || null, timezone: parsed.data.timezone, defaultAppointmentDuration: parsed.data.defaultAppointmentDuration, openingHours } });
  revalidatePath("/configuracion"); revalidatePath("/", "layout");
  return { ok: true };
}


