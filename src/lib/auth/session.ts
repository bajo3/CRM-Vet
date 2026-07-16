import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getPrisma } from "../prisma";

const COOKIE_NAME = "vetcrm_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export type SessionPayload = {
  userId: string;
  clinicId: string;
  role: Role;
  name: string;
  /** Cuenta de plataforma sin clínica propia, gatea únicamente /admin/*. Ver `requireSuperAdmin`. */
  superAdmin?: boolean;
};

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Falta SESSION_SECRET en las variables de entorno.");
  return new TextEncoder().encode(secret);
}

/** Firma el JWT de sesión y lo guarda en una cookie httpOnly (7 días de duración). */
export async function createSession(payload: SessionPayload): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Borra la cookie de sesión (logout). */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Lee y valida la sesión desde la cookie. Devuelve `null` si no hay sesión, es inválida, o la
 * membresía fue desactivada/eliminada.
 *
 * El rol se vuelve a verificar en la base en cada request (no se confía en el valor firmado en el
 * JWT): si un OWNER cambia el rol de alguien o lo desactiva, ese cambio debe aplicarse de inmediato
 * y no recién cuando esa persona vuelva a iniciar sesión (la cookie dura 7 días). Lo mismo aplica a
 * `clinic.status` (una clínica rechazada/pendiente pierde acceso al toque) y a `isSuperAdmin`.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const { userId, clinicId, name, superAdmin } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || typeof clinicId !== "string" || typeof name !== "string") {
      return null;
    }

    const prisma = getPrisma();

    // Sesión de superadmin puro (sin clínica propia): la única fuente de verdad es `isSuperAdmin`.
    if (clinicId === "") {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
      if (!user?.isSuperAdmin) return null;
      return { userId, clinicId: "", role: "OWNER", name, superAdmin: true };
    }

    const membership = await prisma.clinicMember.findUnique({
      where: { clinicId_userId: { clinicId, userId } },
      select: { role: true, active: true, clinic: { select: { status: true } } },
    });
    if (!membership || !membership.active || membership.clinic.status !== "APPROVED") return null;

    // El flag de superadmin en el JWT es solo una pista: si además tiene una clínica propia, se
    // reconfirma acá contra la base antes de otorgarlo.
    let stillSuperAdmin = false;
    if (superAdmin === true) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
      stillSuperAdmin = user?.isSuperAdmin ?? false;
    }

    return { userId, clinicId, role: membership.role, name, ...(stillSuperAdmin ? { superAdmin: true } : {}) };
  } catch {
    return null;
  }
}

/** Exige una sesión de superadmin de plataforma (no ligada a ninguna clínica en particular). */
export async function requireSuperAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session?.superAdmin) redirect("/login");
  return session;
}

/** Para Server Components/Pages del panel: exige sesión válida o redirige a /login. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Exige sesión válida y que el rol esté dentro de los permitidos; si no, redirige (por defecto a
 * /clientes). Pensado para gatear páginas completas (p.ej. formularios de alta/edición).
 */
export async function requireRole(allowed: Role[], fallback = "/clientes"): Promise<SessionPayload> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    redirect(fallback);
  }
  return session;
}

/** Chequeo booleano de rol, para usar dentro de server actions (sin redirigir). */
export function hasRole(session: SessionPayload, allowed: Role[]): boolean {
  return allowed.includes(session.role);
}
