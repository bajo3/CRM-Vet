import type { Clinic } from "@prisma/client";
import { DateTime } from "luxon";
import { getPrisma } from "../prisma";
import { normalizePhone } from "../phone";
import { createAppointment } from "./appointments";
import { getAvailableSlots } from "./availability";
import { AppointmentConflictError } from "./errors";

/** Hasta cuántos días hacia adelante se puede reservar desde la página pública. */
export const ONLINE_BOOKING_MAX_DAYS_AHEAD = 30;
/** Tope de turnos futuros activos por teléfono, para que la página pública no sirva para bloquear la agenda. */
export const ONLINE_BOOKING_MAX_ACTIVE_PER_PHONE = 3;

export class OnlineBookingError extends Error {
  constructor(public readonly code: "INVALID_DATE" | "SLOT_TAKEN" | "TOO_MANY_ACTIVE" | "NO_VETERINARIAN") {
    super(code);
  }
}

/** Clínica activa que publicó su página de reserva con ese slug, o `null`. */
export async function getBookingClinic(slug: string): Promise<Clinic | null> {
  return getPrisma().clinic.findFirst({ where: { bookingSlug: slug, status: "APPROVED" } });
}

function isBookableDate(clinic: Clinic, date: string): boolean {
  const day = DateTime.fromISO(date, { zone: clinic.timezone });
  if (!day.isValid) return false;
  const today = DateTime.now().setZone(clinic.timezone).startOf("day");
  return day >= today && day <= today.plus({ days: ONLINE_BOOKING_MAX_DAYS_AHEAD });
}

async function activeVeterinarianIds(clinicId: string): Promise<string[]> {
  const members = await getPrisma().clinicMember.findMany({
    where: { clinicId, role: "VETERINARIAN", active: true },
    orderBy: { id: "asc" },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

/**
 * Horarios que se pueden ofrecer públicamente para una fecha: la unión de los horarios libres de
 * todos los veterinarios activos (quien reserva online no elige profesional).
 */
export async function getOnlineSlots(clinic: Clinic, date: string): Promise<string[]> {
  if (!isBookableDate(clinic, date)) return [];
  const vetIds = await activeVeterinarianIds(clinic.id);
  const perVet = await Promise.all(vetIds.map((vetId) => getAvailableSlots(clinic, vetId, date)));
  return [...new Set(perVet.flat())].sort();
}

export type OnlineBookingInput = {
  clientName: string;
  phone: string;
  petName: string;
  reason: string;
  date: string;
  time: string;
};

/**
 * Reserva un turno desde la página pública. Identifica al cliente por teléfono (lo crea si no existe,
 * sin pisar los datos de uno existente), reutiliza la mascota si ya tiene una con ese nombre, y
 * asigna el primer veterinario que tenga libre ese horario. El turno queda `PENDING`, igual que los
 * que reserva el bot de WhatsApp.
 */
export async function bookOnline(clinic: Clinic, input: OnlineBookingInput) {
  const prisma = getPrisma();
  if (!isBookableDate(clinic, input.date)) throw new OnlineBookingError("INVALID_DATE");

  const startAt = DateTime.fromISO(`${input.date}T${input.time}`, { zone: clinic.timezone }).toUTC().toJSDate();
  const endAt = new Date(startAt.getTime() + clinic.defaultAppointmentDuration * 60_000);
  if (Number.isNaN(startAt.getTime()) || startAt <= new Date()) throw new OnlineBookingError("INVALID_DATE");

  const vetIds = await activeVeterinarianIds(clinic.id);
  if (vetIds.length === 0) throw new OnlineBookingError("NO_VETERINARIAN");

  const phone = normalizePhone(input.phone);
  let client = await prisma.client.findUnique({ where: { clinicId_phone: { clinicId: clinic.id, phone } } });
  if (client) {
    const active = await prisma.appointment.count({
      where: { clinicId: clinic.id, pet: { clientId: client.id }, status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: new Date() } },
    });
    if (active >= ONLINE_BOOKING_MAX_ACTIVE_PER_PHONE) throw new OnlineBookingError("TOO_MANY_ACTIVE");
  } else {
    client = await prisma.client.create({ data: { clinicId: clinic.id, phone, name: input.clientName } });
  }

  const pet =
    (await prisma.pet.findFirst({
      where: { clinicId: clinic.id, clientId: client.id, name: { equals: input.petName, mode: "insensitive" } },
    })) ?? (await prisma.pet.create({ data: { clinicId: clinic.id, clientId: client.id, name: input.petName, species: "A confirmar" } }));

  for (const veterinarianId of vetIds) {
    const free = await getAvailableSlots(clinic, veterinarianId, input.date);
    if (!free.includes(input.time)) continue;
    try {
      return await createAppointment({ clinicId: clinic.id, petId: pet.id, veterinarianId, reason: input.reason, startAt, endAt, source: "ONLINE" });
    } catch (error) {
      // Otra reserva tomó ese horario con este profesional justo ahora: se prueba con el siguiente.
      if (error instanceof AppointmentConflictError) continue;
      throw error;
    }
  }
  throw new OnlineBookingError("SLOT_TAKEN");
}
