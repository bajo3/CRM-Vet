"use server";

import { redirect } from "next/navigation";
import { getPrisma } from "../prisma";
import { createSession, deleteSession } from "../auth/session";
import { verifyPassword } from "../auth/password";
import { loginSchema, type LoginInput } from "../validation/auth";

export type LoginResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; message: string; fieldErrors?: Partial<Record<keyof LoginInput, string>> };

const GENERIC_INVALID_MESSAGE = "Correo o contraseña incorrectos.";

/**
 * Verifica credenciales, resuelve la clínica activa (primera membresía activa y aprobada) y crea la
 * sesión. Si no hay ninguna clínica utilizable pero la cuenta es superadmin, crea una sesión sin
 * clínica que solo sirve para entrar a /admin.
 */
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

  const memberships = await prisma.clinicMember.findMany({
    where: { userId: user.id, active: true },
    orderBy: { id: "asc" },
    include: { clinic: { select: { status: true, statusReason: true } } },
  });
  const usable = memberships.find((membership) => membership.clinic.status === "APPROVED");

  if (usable) {
    await createSession({ userId: user.id, clinicId: usable.clinicId, role: usable.role, name: user.name, superAdmin: user.isSuperAdmin || undefined });
    return { ok: true };
  }

  if (user.isSuperAdmin) {
    await createSession({ userId: user.id, clinicId: "", role: "OWNER", name: user.name, superAdmin: true });
    return { ok: true, redirectTo: "/admin/clinicas" };
  }

  const pending = memberships.find((membership) => membership.clinic.status === "PENDING");
  if (pending) {
    return { ok: false, message: "Tu clínica todavía está pendiente de aprobación. Te avisaremos cuando esté lista." };
  }
  const rejected = memberships.find((membership) => membership.clinic.status === "REJECTED");
  if (rejected) {
    const reason = rejected.clinic.statusReason;
    return {
      ok: false,
      message: reason ? `Tu solicitud fue rechazada: ${reason}` : "Tu solicitud de alta fue rechazada. Contactanos si creés que es un error.",
    };
  }

  return { ok: false, message: "Tu usuario no tiene una clínica activa asignada. Contactá al administrador." };
}

/** Borra la sesión y redirige a /login. */
export async function logout(): Promise<never> {
  await deleteSession();
  redirect("/login");
}
