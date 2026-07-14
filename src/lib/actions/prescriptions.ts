"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasRole } from "../auth/session";
import { PRESCRIPTION_ROLES } from "../auth/roles";
import { createPrescription } from "../services/prescriptions";
import { prescriptionFormSchema, type PrescriptionFormInput } from "../validation/prescription";
import type { ActionResult, ActionFailure } from "./types";

const NO_SESSION: ActionFailure = { ok: false, message: "Tu sesión expiró. Iniciá sesión nuevamente." };
const NOT_AUTHORIZED: ActionFailure = { ok: false, message: "No tenés permisos para emitir recetas." };

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export type CreatePrescriptionResult = ActionResult<{ id: string }>;

/**
 * Genera una receta para una mascota de la clínica de la sesión. Acto clínico: solo
 * OWNER/ADMIN/VETERINARIAN pueden emitirla (RECEPTIONIST queda afuera). El chequeo se aplica acá,
 * no solo en la UI.
 */
export async function createPrescriptionAction(petId: string, input: PrescriptionFormInput): Promise<CreatePrescriptionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, PRESCRIPTION_ROLES)) return NOT_AUTHORIZED;

  const parsed = prescriptionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const prescription = await createPrescription({
      clinicId: session.clinicId,
      petId,
      userId: session.userId,
      content: parsed.data.content,
    });
    revalidatePath(`/clientes/mascotas/${petId}`);
    return { ok: true, id: prescription.id };
  } catch (error) {
    if (error instanceof Error && error.message === "PET_NOT_FOUND") {
      return { ok: false, message: "No encontramos esa mascota." };
    }
    throw error;
  }
}
