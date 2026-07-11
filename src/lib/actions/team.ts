"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "../prisma";
import { getSession, hasRole } from "../auth/session";
import { TEAM_MANAGE_ROLES } from "../auth/roles";
import { hashPassword } from "../auth/password";
import {
  addTeamMemberSchema,
  changeMemberRoleSchema,
  toggleMemberActiveSchema,
  type AddTeamMemberInput,
  type ChangeMemberRoleInput,
  type ToggleMemberActiveInput,
} from "../validation/team";
import type { ActionResult, ActionFailure } from "./types";

const NOT_AUTHORIZED: ActionFailure = { ok: false, message: "No tenés permisos para gestionar el equipo." };
const NO_SESSION: ActionFailure = { ok: false, message: "Tu sesión expiró. Iniciá sesión nuevamente." };

function isUniqueEmailViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

export type AddTeamMemberResult = ActionResult<{ id: string }>;

/**
 * Agrega un integrante a la clínica de la sesión. Si ya existe un `User` global con ese correo,
 * solo se crea la membresía (no se toca su contraseña ni sus datos); si no existe, se crea el
 * usuario con la contraseña temporal indicada.
 */
export async function addTeamMember(input: AddTeamMemberInput): Promise<AddTeamMemberResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, TEAM_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = addTeamMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    const existingMembership = await prisma.clinicMember.findUnique({
      where: { clinicId_userId: { clinicId: session.clinicId, userId: existingUser.id } },
    });
    if (existingMembership) {
      return {
        ok: false,
        message: "Ese correo ya pertenece a un integrante de esta clínica.",
        fieldErrors: { email: "Ya es parte del equipo." },
      };
    }
    const membership = await prisma.clinicMember.create({
      data: { clinicId: session.clinicId, userId: existingUser.id, role: parsed.data.role, active: true },
    });
    revalidatePath("/configuracion");
    return { ok: true, id: membership.id };
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        memberships: { create: { clinicId: session.clinicId, role: parsed.data.role, active: true } },
      },
      include: { memberships: true },
    });
    revalidatePath("/configuracion");
    return { ok: true, id: created.memberships[0].id };
  } catch (error) {
    if (isUniqueEmailViolation(error)) {
      return { ok: false, message: "Ese correo ya está en uso.", fieldErrors: { email: "Ese correo ya está registrado." } };
    }
    throw error;
  }
}

export type ChangeMemberRoleResult = ActionResult;

/** Cambia el rol de un integrante. No permite bajarse el propio rol ni dejar la clínica sin OWNER activo. */
export async function changeMemberRole(input: ChangeMemberRoleInput): Promise<ChangeMemberRoleResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, TEAM_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = changeMemberRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisá los datos ingresados." };

  const prisma = getPrisma();
  const member = await prisma.clinicMember.findFirst({
    where: { id: parsed.data.memberId, clinicId: session.clinicId },
  });
  if (!member) return { ok: false, message: "No encontramos ese integrante." };

  if (member.userId === session.userId) {
    return { ok: false, message: "No podés cambiar tu propio rol." };
  }

  if (member.role === "OWNER" && parsed.data.role !== "OWNER") {
    const activeOwners = await prisma.clinicMember.count({
      where: { clinicId: session.clinicId, role: "OWNER", active: true, id: { not: member.id } },
    });
    if (activeOwners === 0) {
      return { ok: false, message: "Tiene que quedar al menos un dueño/a activo en la clínica." };
    }
  }

  await prisma.clinicMember.update({ where: { id: member.id }, data: { role: parsed.data.role } });
  revalidatePath("/configuracion");
  return { ok: true };
}

export type ToggleMemberActiveResult = ActionResult;

/** Activa o desactiva un integrante. No permite auto-desactivarse ni dejar la clínica sin OWNER activo. */
export async function toggleMemberActive(input: ToggleMemberActiveInput): Promise<ToggleMemberActiveResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, TEAM_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = toggleMemberActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisá los datos ingresados." };

  const prisma = getPrisma();
  const member = await prisma.clinicMember.findFirst({
    where: { id: parsed.data.memberId, clinicId: session.clinicId },
  });
  if (!member) return { ok: false, message: "No encontramos ese integrante." };

  if (member.userId === session.userId && !parsed.data.active) {
    return { ok: false, message: "No podés desactivarte a vos mismo." };
  }

  if (member.role === "OWNER" && !parsed.data.active) {
    const activeOwners = await prisma.clinicMember.count({
      where: { clinicId: session.clinicId, role: "OWNER", active: true, id: { not: member.id } },
    });
    if (activeOwners === 0) {
      return { ok: false, message: "Tiene que quedar al menos un dueño/a activo en la clínica." };
    }
  }

  await prisma.clinicMember.update({ where: { id: member.id }, data: { active: parsed.data.active } });
  revalidatePath("/configuracion");
  revalidatePath("/agenda");
  return { ok: true };
}

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
