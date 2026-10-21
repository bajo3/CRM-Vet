"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession, hasRole } from "../auth/session";
import { CLINIC_CONFIG_ROLES } from "../auth/roles";
import { getPrisma } from "../prisma";
import { checkRateLimit, clientIpFromHeaders } from "../rate-limit";
import { bookOnline, getBookingClinic, getOnlineSlots, OnlineBookingError } from "../services/online-booking";
import { onlineBookingSchema, type OnlineBookingFormInput } from "../validation/online-booking";
import type { ActionResult } from "./types";

const BOOKING_ERROR_MESSAGES: Record<OnlineBookingError["code"], string> = {
  INVALID_DATE: "Esa fecha ya no está disponible. Elegí otra.",
  SLOT_TAKEN: "Ese horario se acaba de ocupar. Elegí otro, por favor.",
  TOO_MANY_ACTIVE: "Ya tenés varios turnos reservados con este teléfono. Para sumar otro, comunicate con la clínica.",
  NO_VETERINARIAN: "La clínica todavía no tiene agenda disponible para reservar online.",
};

/** Horarios libres de una fecha para la página pública de reserva. Público, con rate limit por IP. */
export async function getPublicSlots(slug: string, date: string): Promise<string[]> {
  const ip = clientIpFromHeaders(await headers());
  if (!checkRateLimit(`online-slots:${ip}`, 60, 60_000).allowed) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const clinic = await getBookingClinic(slug);
  if (!clinic) return [];
  return getOnlineSlots(clinic, date);
}

export type SubmitOnlineBookingResult = ActionResult<{ date: string; time: string }>;

/** Reserva pública de un turno. No requiere sesión: valida todo y limita los intentos por IP. */
export async function submitOnlineBooking(input: OnlineBookingFormInput): Promise<SubmitOnlineBookingResult> {
  const ip = clientIpFromHeaders(await headers());
  if (!checkRateLimit(`online-booking:${ip}`, 5, 10 * 60_000).allowed) {
    return { ok: false, message: "Demasiados intentos. Probá de nuevo en unos minutos." };
  }

  const parsed = onlineBookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors };
  }

  const clinic = await getBookingClinic(parsed.data.slug);
  if (!clinic) return { ok: false, message: "Esta página de reservas ya no está disponible." };

  try {
    await bookOnline(clinic, parsed.data);
  } catch (error) {
    if (error instanceof OnlineBookingError) return { ok: false, message: BOOKING_ERROR_MESSAGES[error.code] };
    throw error;
  }
  revalidatePath("/agenda");
  return { ok: true, date: parsed.data.date, time: parsed.data.time };
}

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "clinica";
}

export type SetOnlineBookingResult = ActionResult<{ slug: string | null }>;

/**
 * Activa o desactiva la página pública de reserva de la clínica. Al activarla se genera un slug a
 * partir del nombre (con un sufijo aleatorio corto, para que sea único y no adivinable en serie).
 */
export async function setOnlineBooking(enabled: boolean): Promise<SetOnlineBookingResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró." };
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return { ok: false, message: "No tenés permisos para modificar la clínica." };

  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({ where: { id: session.clinicId }, select: { name: true, bookingSlug: true } });
  if (!clinic) return { ok: false, message: "Clínica no encontrada." };

  let slug: string | null = null;
  if (enabled) slug = clinic.bookingSlug ?? `${slugify(clinic.name)}-${randomBytes(2).toString("hex")}`;

  await prisma.clinic.update({ where: { id: session.clinicId }, data: { bookingSlug: slug } });
  revalidatePath("/configuracion", "layout");
  return { ok: true, slug };
}
