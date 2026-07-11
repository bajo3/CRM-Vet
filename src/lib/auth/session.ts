import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "vetcrm_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export type SessionPayload = {
  userId: string;
  clinicId: string;
  role: Role;
  name: string;
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

/** Lee y valida la sesión desde la cookie. Devuelve `null` si no hay sesión o es inválida. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const { userId, clinicId, role, name } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || typeof clinicId !== "string" || typeof role !== "string" || typeof name !== "string") {
      return null;
    }
    return { userId, clinicId, role: role as Role, name };
  } catch {
    return null;
  }
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
