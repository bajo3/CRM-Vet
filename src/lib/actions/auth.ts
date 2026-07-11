"use server";

import { redirect } from "next/navigation";
import { getPrisma } from "../prisma";
import { createSession, deleteSession } from "../auth/session";
import { verifyPassword } from "../auth/password";
import { loginSchema, type LoginInput } from "../validation/auth";

export type LoginResult = { ok: true } | { ok: false; message: string; fieldErrors?: Partial<Record<keyof LoginInput, string>> };

const GENERIC_INVALID_MESSAGE = "Correo o contraseña incorrectos.";

/** Verifica credenciales, resuelve la clínica activa (primera membresía activa) y crea la sesión. */
export async function login(input: LoginInput): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof LoginInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof LoginInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.passwordHash) {
    return { ok: false, message: GENERIC_INVALID_MESSAGE };
  }

  const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!validPassword) {
    return { ok: false, message: GENERIC_INVALID_MESSAGE };
  }

  const membership = await prisma.clinicMember.findFirst({
    where: { userId: user.id, active: true },
    orderBy: { id: "asc" },
    include: { clinic: true },
  });
  if (!membership) {
    return { ok: false, message: "Tu usuario no tiene una clínica activa asignada. Contactá al administrador." };
  }

  await createSession({ userId: user.id, clinicId: membership.clinicId, role: membership.role, name: user.name });
  return { ok: true };
}

/** Borra la sesión y redirige a /login. */
export async function logout(): Promise<never> {
  await deleteSession();
  redirect("/login");
}
