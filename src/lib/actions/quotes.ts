"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "../auth/session";
import { createQuote } from "../services/quotes";
import { quoteFormSchema, type QuoteFormInput } from "../validation/quote";
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

export type CreateQuoteResult = ActionResult<{ id: string }>;

/**
 * Genera un presupuesto para una mascota de la clínica de la sesión. Documento comercial: puede
 * crearlo cualquier usuario autenticado de la clínica (no hay restricción de rol adicional).
 */
export async function createQuoteAction(petId: string, input: QuoteFormInput): Promise<CreateQuoteResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;

  const parsed = quoteFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const quote = await createQuote({
      clinicId: session.clinicId,
      petId,
      userId: session.userId,
      title: parsed.data.title,
      items: parsed.data.items,
      notes: parsed.data.notes,
    });
    revalidatePath(`/clientes/mascotas/${petId}`);
    return { ok: true, id: quote.id };
  } catch (error) {
    if (error instanceof Error && error.message === "PET_NOT_FOUND") {
      return { ok: false, message: "No encontramos esa mascota." };
    }
    throw error;
  }
}
