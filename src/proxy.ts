import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "vetcrm_session";
const PUBLIC_ROUTES = new Set(["/login"]);

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const key = getSecretKey();
  if (!key) return false;
  try {
    await jwtVerify(token, key, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Chequeo optimista de sesión (solo lee/valida la cookie firmada, sin ir a la base). Redirige a
 * /login si falta sesión en una ruta protegida, y a / si ya hay sesión y se intenta ir a /login.
 * La verificación completa (clinicId, role) se hace siempre en cada página/server action.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);
  const authenticated = await hasValidSession(request);

  if (!isPublicRoute && !authenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicRoute && authenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
