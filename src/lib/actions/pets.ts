"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "../prisma";
import { getSession, hasRole } from "../auth/session";
import { CLIENT_MANAGE_ROLES } from "../auth/roles";
import { petFormSchema, type PetFormInput } from "../validation/pet";
import type { ActionResult, ActionFailure } from "./types";

const NOT_AUTHORIZED: ActionFailure = { ok: false, message: "No tenés permisos para esta acción." };
const NO_SESSION: ActionFailure = { ok: false, message: "Tu sesión expiró. Iniciá sesión nuevamente." };

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export type CreatePetResult = ActionResult<{ id: string }>;

/** Crea una mascota para un cliente de la clínica de la sesión. Sólo OWNER/ADMIN/RECEPTIONIST. */
export async function createPet(input: PetFormInput): Promise<CreatePetResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = petFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, clinicId: session.clinicId } });
  if (!client) return { ok: false, message: "El tutor elegido no pertenece a esta clínica.", fieldErrors: { clientId: "Elegí un tutor válido." } };

  const pet = await prisma.pet.create({
    data: {
      clinicId: session.clinicId,
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      species: parsed.data.species,
      photoUrl: parsed.data.photoUrl ?? null,
      breed: parsed.data.breed ?? null,
      sex: parsed.data.sex ?? null,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      approximateAge: parsed.data.approximateAge ?? null,
      weight: parsed.data.weight ?? null,
      notes: parsed.data.notes ?? null,
    },
  });
  revalidatePath("/clientes");
  return { ok: true, id: pet.id };
}

export type UpdatePetResult = ActionResult;

/** Edita una mascota existente, verificando que pertenezca a la clínica de la sesión. */
export async function updatePet(petId: string, input: PetFormInput): Promise<UpdatePetResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = petFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  const existing = await prisma.pet.findFirst({ where: { id: petId, clinicId: session.clinicId } });
  if (!existing) return { ok: false, message: "No encontramos esa mascota." };

  const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, clinicId: session.clinicId } });
  if (!client) return { ok: false, message: "El tutor elegido no pertenece a esta clínica.", fieldErrors: { clientId: "Elegí un tutor válido." } };

  await prisma.pet.update({
    where: { id: petId },
    data: {
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      species: parsed.data.species,
      photoUrl: parsed.data.photoUrl ?? null,
      breed: parsed.data.breed ?? null,
      sex: parsed.data.sex ?? null,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      approximateAge: parsed.data.approximateAge ?? null,
      weight: parsed.data.weight ?? null,
      notes: parsed.data.notes ?? null,
    },
  });
  revalidatePath("/clientes");
  revalidatePath(`/clientes/mascotas/${petId}`);
  return { ok: true };
}
