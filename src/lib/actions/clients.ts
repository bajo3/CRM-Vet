"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "../prisma";
import { getSession, hasRole } from "../auth/session";
import { CLIENT_MANAGE_ROLES } from "../auth/roles";
import { normalizePhone } from "../phone";
import { clientFormSchema, type ClientFormInput } from "../validation/client";
import type { ActionResult, ActionFailure } from "./types";

const NOT_AUTHORIZED: ActionFailure = { ok: false, message: "No tenés permisos para esta acción." };
const NO_SESSION: ActionFailure = { ok: false, message: "Tu sesión expiró. Iniciá sesión nuevamente." };

function isUniquePhoneViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

export type CreateClientResult = ActionResult<{ id: string }>;

/** Crea un cliente en la clínica de la sesión. Sólo OWNER/ADMIN/RECEPTIONIST. */
export async function createClient(input: ClientFormInput): Promise<CreateClientResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  try {
    const client = await prisma.client.create({
      data: {
        clinicId: session.clinicId,
        name: parsed.data.name,
        phone: normalizePhone(parsed.data.phone),
        email: parsed.data.email ?? null,
        address: parsed.data.address ?? null,
        remindersEnabled: parsed.data.remindersEnabled,
      },
    });
    revalidatePath("/clientes");
    return { ok: true, id: client.id };
  } catch (error) {
    if (isUniquePhoneViolation(error)) {
      return { ok: false, message: "Ya existe un cliente con ese teléfono en esta clínica.", fieldErrors: { phone: "Ese teléfono ya está registrado." } };
    }
    throw error;
  }
}

export type UpdateClientResult = ActionResult;

/** Edita un cliente existente, verificando que pertenezca a la clínica de la sesión. */
export async function updateClient(clientId: string, input: ClientFormInput): Promise<UpdateClientResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  const existing = await prisma.client.findFirst({ where: { id: clientId, clinicId: session.clinicId } });
  if (!existing) return { ok: false, message: "No encontramos ese cliente." };

  try {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        name: parsed.data.name,
        phone: normalizePhone(parsed.data.phone),
        email: parsed.data.email ?? null,
        address: parsed.data.address ?? null,
        remindersEnabled: parsed.data.remindersEnabled,
      },
    });
    revalidatePath("/clientes");
    return { ok: true };
  } catch (error) {
    if (isUniquePhoneViolation(error)) {
      return { ok: false, message: "Ya existe un cliente con ese teléfono en esta clínica.", fieldErrors: { phone: "Ese teléfono ya está registrado." } };
    }
    throw error;
  }
}

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
