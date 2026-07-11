"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { getPrisma } from "../prisma";
import { getSession } from "../auth/session";
import { createMedicalRecord } from "../services/medical-records";
import { medicalRecordFormSchema, NEXT_CONTROL_OPTIONS, type MedicalRecordFormInput } from "../validation/medical-record";
import type { ActionResult, ActionFailure } from "./types";

const NO_SESSION: ActionFailure = { ok: false, message: "Tu sesión expiró. Iniciá sesión nuevamente." };

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Resuelve la fecha concreta del próximo control a partir de la opción rápida elegida (en la zona horaria de la clínica, 09:00 local). */
function resolveNextDueDate(option: MedicalRecordFormInput["nextControlOption"], customDate: string | undefined, timezone: string): Date | null {
  if (option === "none") return null;
  if (option === "custom") {
    if (!customDate) return null;
    return DateTime.fromISO(customDate, { zone: timezone }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  }
  const preset = NEXT_CONTROL_OPTIONS.find((item) => item.value === option);
  const days = preset && "days" in preset ? preset.days : undefined;
  if (!days) return null;
  return DateTime.now().setZone(timezone).plus({ days }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toJSDate();
}

export type RegisterMedicalRecordResult = ActionResult<{ id: string }>;

/** Registra una atención para una mascota de la clínica de la sesión. El profesional es el usuario logueado. */
export async function registerMedicalRecord(petId: string, input: MedicalRecordFormInput): Promise<RegisterMedicalRecordResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;

  const parsed = medicalRecordFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  const pet = await prisma.pet.findFirst({ where: { id: petId, clinicId: session.clinicId }, include: { clinic: true } });
  if (!pet) return { ok: false, message: "No encontramos esa mascota." };

  const nextDueDate = resolveNextDueDate(parsed.data.nextControlOption, parsed.data.nextControlDate, pet.clinic.timezone);

  try {
    const record = await createMedicalRecord({
      clinicId: session.clinicId,
      petId,
      userId: session.userId,
      type: parsed.data.type,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      weight: parsed.data.weight ?? null,
      treatment: parsed.data.treatment ?? null,
      nextDueDate,
    });
    revalidatePath(`/clientes/mascotas/${petId}`);
    revalidatePath("/");
    return { ok: true, id: record.id };
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_NEXT_DUE_DATE") {
      return { ok: false, message: "La fecha del próximo control debe ser posterior a hoy.", fieldErrors: { nextControlDate: "Elegí una fecha futura." } };
    }
    if (error instanceof Error && error.message === "PET_NOT_FOUND") {
      return { ok: false, message: "No encontramos esa mascota." };
    }
    throw error;
  }
}
