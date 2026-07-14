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
 * /login si falta sesión en una ruta protegida. La verificación completa (clinicId, role, y que la
 * membresía siga activa) se hace siempre en cada página/server action vía `getSession()`.
 *
 * A propósito NO redirige "/login" -> "/" solo por tener una cookie con firma válida: esa cookie
 * puede pertenecer a una membresía que un dueño/a ya desactivó, y `getSession()` la va a rechazar
 * (rol vivo desde la base). Si acá bounceáramos "/login" hacia "/" por firma válida nomás, esa
 * combinación crea un loop infinito de redirects para cualquier usuario desactivado con la cookie
 * todavía puesta (el layout protegido lo manda a /login, y este proxy lo devuelve a /). La página de
 * login ya funciona bien mostrándose de nuevo aunque haya cookie.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);
  const authenticated = await hasValidSession(request);

  if (!isPublicRoute && !authenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
