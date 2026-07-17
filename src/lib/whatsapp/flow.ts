import { AppointmentStatus, ConversationStatus, Prisma, type Clinic } from "@prisma/client";
import { DateTime } from "luxon";
import { getPrisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { getAvailableSlots } from "@/lib/services/availability";
import { createAppointment, rescheduleAppointment, updateAppointmentStatus } from "@/lib/services/appointments";
import { AppointmentConflictError } from "@/lib/services/errors";
import type { IncomingWhatsappEvent, WhatsappEventResponse } from "./contracts";
import { describeDate, joinTimes, parseNaturalDate, parseNaturalTime } from "./date-parser";
import {
  buildGreeting,
  extractReason,
  isAsapIntent,
  isBookingIntent,
  isCancelIntent,
  isCheckAvailabilityIntent,
  isConfirmIntent,
  isGreeting,
  isResetIntent,
  isRescheduleIntent,
  isUrgent,
  requiresHuman,
} from "./intent";

type AlternativeDay = { date: string; times: string[] };

type FlowStep =
  | "SELECT_PET"
  | "NEW_PET_NAME"
  | "REASON"
  | "AWAIT_DATE"
  | "AWAIT_ALTERNATIVES"
  | "AWAIT_TIME"
  | "CONFIRM_CANCEL_CHOICE"
  | "RESCHEDULE_AWAIT_DATE"
  | "RESCHEDULE_AWAIT_ALTERNATIVES"
  | "RESCHEDULE_AWAIT_TIME";

type FlowState = {
  step?: FlowStep;
  petId?: string;
  petName?: string;
  reason?: string;
  date?: string;
  offeredTimes?: string[];
  offeredSlots?: AlternativeDay[];
  misunderstoodCount?: number;
  /** Turno que se está reprogramando (solo presente durante los pasos RESCHEDULE_*). */
  rescheduleAppointmentId?: string;
};

/** A qué operación de agenda corresponde el paso de fecha/horario en curso: reserva nueva o reprogramación de un turno existente. */
type BookingMode = { kind: "create" } | { kind: "reschedule"; appointmentId: string };

const REASON_MENU: Record<string, string> = { "1": "Consulta", "2": "Vacunación", "3": "Control", "4": "Otro" };

const URGENT_REPLY =
  "Esto suena a una urgencia 😟 Ya derivo tu mensaje a la veterinaria para que te contacte lo antes posible. Si tu mascota está en riesgo, por favor acercate ya mismo a la clínica o a la guardia veterinaria más cercana. No puedo darte indicaciones médicas por este medio.";

const NON_URGENT_DERIVE_REPLY = "Voy a derivar tu consulta a la veterinaria. Te van a contactar por este mismo medio.";

const NOT_UNDERSTOOD_TWICE_REPLY = "Perdón, no llegué a entenderte 😅 Ya te derivo con el equipo para que te ayuden directamente.";

function asFlowState(value: Prisma.JsonValue | null): FlowState {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as FlowState) : {};
}

function localDateTime(date: string, time: string, timezone: string) {
  return DateTime.fromISO(`${date}T${time}`, { zone: timezone }).toUTC().toJSDate();
}

function formatAppointmentWhen(startAt: Date, timezone: string): string {
  const local = DateTime.fromJSDate(startAt).setZone(timezone);
  return `${describeDate(local.toFormat("yyyy-MM-dd"), timezone)} a las ${local.toFormat("HH:mm")}`;
}

async function findActiveAppointment(clinicId: string, clientId: string) {
  return getPrisma().appointment.findFirst({
    where: {
      clinicId,
      pet: { clientId },
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      startAt: { gte: new Date() },
    },
    orderBy: { startAt: "asc" },
    include: { pet: true },
  });
}

/**
 * Busca, a partir de `fromDate` (inclusive), los próximos `count` días con al menos un horario
 * libre para el veterinario. No consulta más de `maxDaysToCheck` días para no quedar en un loop.
 */
async function findNextAvailableDays(clinic: Clinic, veterinarianId: string, fromDate: DateTime, count: number, maxDaysToCheck = 30): Promise<AlternativeDay[]> {
  const results: AlternativeDay[] = [];
  let cursor = fromDate;
  let checked = 0;
  while (results.length < count && checked < maxDaysToCheck) {
    const iso = cursor.toFormat("yyyy-MM-dd");
    const times = await getAvailableSlots(clinic, veterinarianId, iso);
    if (times.length > 0) results.push({ date: iso, times });
    cursor = cursor.plus({ days: 1 });
    checked++;
  }
  return results;
}

// Cuántos horarios se muestran por día al ofrecer alternativas: unos pocos alcanzan para que el
// mensaje sea legible (un día con horario corrido puede tener 15+ slots libres).
const MAX_ALT_TIMES_SHOWN = 3;

/** Horarios de un día alternativo que efectivamente se muestran en el texto (y que el número de la lista referencia). */
function shownTimesForAlt(times: string[], index: number): string[] {
  return index === 0 ? times.slice(0, MAX_ALT_TIMES_SHOWN) : times.slice(0, 1);
}

function describeAlternatives(alternatives: AlternativeDay[], timezone: string): string {
  const parts = alternatives.map((alt, index) => {
    const label = describeDate(alt.date, timezone);
    return `${label} a las ${joinTimes(shownTimesForAlt(alt.times, index))}`;
  });
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")}, o ${parts[parts.length - 1]}`;
}

function timeMenuReply(date: string, times: string[], petName: string | undefined, timezone: string): string {
  const label = describeDate(date, timezone);
  const menu = times.map((time, index) => `${index + 1}. ${time}`).join("\n");
  const who = petName ? ` para ${petName}` : "";
  return `Para ${label}${who} tengo estos horarios libres:\n\n${menu}\n\n¿Cuál preferís? (podés responder con el número o el horario)`;
}

/** Interpreta la respuesta del usuario en el paso de elegir horario: número de la lista u horario natural. */
function resolveTimeChoice(text: string, times: string[]): string | null {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    return index >= 0 && index < times.length ? times[index] : null;
  }
  const parsed = parseNaturalTime(trimmed);
  return parsed && times.includes(parsed) ? parsed : null;
}

type AlternativeSelection = { kind: "slot"; date: string; time: string } | { kind: "date"; date: string; times: string[] };

/** Interpreta la respuesta del usuario cuando se le ofrecieron días alternativos con disponibilidad. */
function resolveAlternativeSelection(text: string, alternatives: AlternativeDay[], timezone: string): AlternativeSelection | null {
  const shown = alternatives.flatMap((alt, index) => shownTimesForAlt(alt.times, index).map((time) => ({ date: alt.date, time })));
  const trimmed = text.trim();

  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    return index >= 0 && index < shown.length ? { kind: "slot", date: shown[index].date, time: shown[index].time } : null;
  }

  if (isAsapIntent(text) && shown.length > 0) {
    return { kind: "slot", date: shown[0].date, time: shown[0].time };
  }

  const parsedDate = parseNaturalDate(text, timezone);
  if (parsedDate) {
    const match = alternatives.find((alt) => alt.date === parsedDate);
    if (match) return match.times.length === 1 ? { kind: "slot", date: match.date, time: match.times[0] } : { kind: "date", date: match.date, times: match.times };
  }

  const parsedTime = parseNaturalTime(text);
  if (parsedTime) {
    const matches = alternatives.filter((alt) => alt.times.includes(parsedTime));
    if (matches.length === 1) return { kind: "slot", date: matches[0].date, time: parsedTime };
  }

  return null;
}

type PetOption = { id: string; name: string };

function matchPetSelection(text: string, pets: PetOption[]): "new" | PetOption | null {
  const trimmed = text.trim();
  if (/\b(nueva|otra)\b/i.test(trimmed)) return "new";
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (num === pets.length + 1) return "new";
    if (num >= 1 && num <= pets.length) return pets[num - 1];
    return null;
  }
  return pets.find((pet) => pet.name.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

type BookingCtx = {
  prisma: ReturnType<typeof getPrisma>;
  clinic: Clinic;
  clientId: string;
  timezone: string;
  vetPromise: Promise<{ userId: string }> | null;
  getVeterinarian(): Promise<{ userId: string }>;
};

function makeBookingCtx(prisma: ReturnType<typeof getPrisma>, clinic: Clinic, clientId: string): BookingCtx {
  const ctx: BookingCtx = {
    prisma,
    clinic,
    clientId,
    timezone: clinic.timezone,
    vetPromise: null,
    async getVeterinarian() {
      if (!ctx.vetPromise) {
        ctx.vetPromise = prisma.clinicMember
          .findFirst({ where: { clinicId: clinic.id, role: "VETERINARIAN", active: true } })
          .then((vet) => {
            if (!vet) throw new Error("NO_VETERINARIAN_CONFIGURED");
            return { userId: vet.userId };
          });
      }
      return ctx.vetPromise;
    },
  };
  return ctx;
}

/** Igual que `makeBookingCtx`, pero fija el veterinario al del turno existente: al reprogramar no se elige otro veterinario. */
function makeRescheduleCtx(prisma: ReturnType<typeof getPrisma>, clinic: Clinic, clientId: string, veterinarianId: string): BookingCtx {
  return {
    prisma,
    clinic,
    clientId,
    timezone: clinic.timezone,
    vetPromise: Promise.resolve({ userId: veterinarianId }),
    async getVeterinarian() {
      return { userId: veterinarianId };
    },
  };
}

type StepResult = { reply: string; nextState: FlowState; status?: ConversationStatus; resolvedPetId?: string };

/** Dado el estado de la reserva en curso, decide cuál es el próximo dato que falta y lo pide. */
async function advanceBooking(ctx: BookingCtx, state: FlowState): Promise<StepResult> {
  if (!state.petId) {
    const pets = await ctx.prisma.pet.findMany({ where: { clinicId: ctx.clinic.id, clientId: ctx.clientId }, orderBy: { name: "asc" } });
    if (pets.length === 0) {
      return { reply: "¡Genial! ¿Cómo se llama tu mascota? 🐾", nextState: { ...state, step: "NEW_PET_NAME" } };
    }
    if (pets.length === 1) {
      return advanceBooking(ctx, { ...state, petId: pets[0].id, petName: pets[0].name });
    }
    const listText = pets.map((pet, index) => `${index + 1}. ${pet.name}`).join("\n");
    return {
      reply: `¿Para cuál de tus mascotas es el turno? 🐾\n\n${listText}\n${pets.length + 1}. Otra mascota`,
      nextState: { ...state, step: "SELECT_PET" },
    };
  }

  if (!state.reason) {
    return {
      reply: `Turno para ${state.petName ?? "tu mascota"} 🐶 ¿Cuál es el motivo?\n\n1. Consulta\n2. Vacunación\n3. Control\n4. Otro`,
      nextState: { ...state, step: "REASON" },
      resolvedPetId: state.petId,
    };
  }

  if (!state.date) {
    return {
      reply: `Dale, ${state.reason.toLowerCase()} para ${state.petName ?? "tu mascota"}. ¿Qué día te queda bien? Podés decirme "mañana", "el lunes" o una fecha como 15/07.`,
      nextState: { ...state, step: "AWAIT_DATE" },
      resolvedPetId: state.petId,
    };
  }

  return resolveDateAvailability(ctx, state);
}

/** Busca horarios para `state.date`; si no hay, ofrece los próximos días con disponibilidad real. Común a reservar y reprogramar. */
async function resolveDateAvailability(ctx: BookingCtx, state: FlowState, mode: BookingMode = { kind: "create" }): Promise<StepResult> {
  const { timezone, clinic } = ctx;
  const vet = await ctx.getVeterinarian();
  const requestedDate = state.date!;
  const requestedDay = DateTime.fromISO(requestedDate, { zone: timezone });
  const today = DateTime.now().setZone(timezone).startOf("day");
  const isPast = requestedDay < today;
  const isToday = requestedDay.hasSame(today, "day");
  const excludeAppointmentId = mode.kind === "reschedule" ? mode.appointmentId : undefined;
  const timeStep: FlowStep = mode.kind === "reschedule" ? "RESCHEDULE_AWAIT_TIME" : "AWAIT_TIME";
  const alternativesStep: FlowStep = mode.kind === "reschedule" ? "RESCHEDULE_AWAIT_ALTERNATIVES" : "AWAIT_ALTERNATIVES";

  const times = isPast ? [] : await getAvailableSlots(clinic, vet.userId, requestedDate, excludeAppointmentId);

  if (times.length > 0) {
    return {
      reply: timeMenuReply(requestedDate, times, state.petName, timezone),
      nextState: { ...state, step: timeStep, date: requestedDate, offeredTimes: times },
      resolvedPetId: state.petId,
    };
  }

  const searchStart = (isPast || isToday ? today : requestedDay).plus({ days: 1 });
  const alternatives = await findNextAvailableDays(clinic, vet.userId, searchStart, 3);

  const intro = isPast ? "Esa fecha ya pasó 😕" : isToday ? "Hoy ya no me quedan lugares 😕" : "Ese día no tengo lugares libres 😕";

  if (alternatives.length === 0) {
    return {
      reply: `${intro} Por ahora no encuentro turnos en los próximos días. Te derivo con recepción para que te ayuden a coordinar.`,
      nextState: {},
      status: ConversationStatus.REQUIRES_HUMAN,
      resolvedPetId: state.petId,
    };
  }

  return {
    reply: `${intro} Te puedo ofrecer: ${describeAlternatives(alternatives, timezone)}. ¿Cuál te queda bien?`,
    nextState: { ...state, step: alternativesStep, offeredSlots: alternatives },
    resolvedPetId: state.petId,
  };
}

/** Intenta crear (o reprogramar) el turno; si justo se ocupó, vuelve a ofrecer horarios/alternativas para esa fecha. */
async function finalizeBooking(ctx: BookingCtx, state: FlowState, date: string, time: string, mode: BookingMode = { kind: "create" }): Promise<StepResult> {
  const { timezone, clinic } = ctx;
  const vet = await ctx.getVeterinarian();
  const startAt = localDateTime(date, time, timezone);
  const endAt = new Date(startAt.getTime() + clinic.defaultAppointmentDuration * 60_000);
  const excludeAppointmentId = mode.kind === "reschedule" ? mode.appointmentId : undefined;
  const timeStep: FlowStep = mode.kind === "reschedule" ? "RESCHEDULE_AWAIT_TIME" : "AWAIT_TIME";

  try {
    if (mode.kind === "reschedule") {
      await rescheduleAppointment({ clinicId: clinic.id, appointmentId: mode.appointmentId, startAt, endAt });
    } else {
      await createAppointment({
        clinicId: clinic.id,
        petId: state.petId!,
        veterinarianId: vet.userId,
        reason: state.reason!,
        startAt,
        endAt,
        source: "WHATSAPP",
      });
    }
    const label = describeDate(date, timezone);
    const reply =
      mode.kind === "reschedule"
        ? `¡Listo! 🐾 Reprogramamos el turno de ${state.petName ?? "tu mascota"} para ${label} a las ${time}. ¡Te esperamos!`
        : `¡Listo! 🐾 Reservamos el turno para ${state.petName ?? "tu mascota"} ${label} a las ${time} (${state.reason}). Queda pendiente de confirmación. Si necesitás cambiarlo o cancelarlo, escribime "cambiar" o "cancelar".`;
    return { reply, nextState: {}, resolvedPetId: state.petId };
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      const times = await getAvailableSlots(clinic, vet.userId, date, excludeAppointmentId);
      if (times.length > 0) {
        return {
          reply: `Uy, ese horario se acaba de ocupar 😕 ${timeMenuReply(date, times, state.petName, timezone)}`,
          nextState: { ...state, step: timeStep, date, offeredTimes: times },
          resolvedPetId: state.petId,
        };
      }
      return resolveDateAvailability(ctx, { ...state, date }, mode);
    }
    throw error;
  }
}

/** Arranca una reserva desde una frase libre: intenta extraer motivo y fecha de la misma frase. */
function startFreshBooking(ctx: BookingCtx, text: string): Promise<StepResult> {
  const reason = extractReason(text);
  const date = isAsapIntent(text) ? DateTime.now().setZone(ctx.timezone).toFormat("yyyy-MM-dd") : parseNaturalDate(text, ctx.timezone);
  const initial: FlowState = {};
  if (reason) initial.reason = reason;
  if (date) initial.date = date;
  return advanceBooking(ctx, initial);
}

export async function processIncomingWhatsapp(event: IncomingWhatsappEvent): Promise<WhatsappEventResponse> {
  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({ where: { whatsappSessionKey: event.clinicKey } });
  if (!clinic) throw new Error("CLINIC_NOT_CONFIGURED");

  try {
    await prisma.webhookEvent.create({ data: { clinicId: clinic.id, externalEventId: event.eventId, eventType: "message.upsert", payload: event } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { accepted: true, duplicate: true };
    throw error;
  }

  const phone = normalizePhone(event.phone);
  let client = await prisma.client.findUnique({ where: { clinicId_phone: { clinicId: clinic.id, phone } } });
  if (!client) {
    client = await prisma.client.create({ data: { clinicId: clinic.id, phone, name: event.contactName || `WhatsApp ${phone.slice(-4)}` } });
  }

  const conversation = await prisma.whatsappConversation.upsert({
    where: { clinicId_phone: { clinicId: clinic.id, phone } },
    create: { clinicId: clinic.id, clientId: client.id, phone, contactName: event.contactName, unreadCount: 1 },
    update: { clientId: client.id, contactName: event.contactName, lastMessageAt: new Date(event.timestamp), unreadCount: { increment: 1 } },
  });

  await prisma.whatsappMessage.create({
    data: { clinicId: clinic.id, conversationId: conversation.id, direction: "INBOUND", content: event.text, externalMessageId: event.eventId, status: "RECEIVED" },
  });

  const state = asFlowState(conversation.flowState);
  const raw = event.text.trim();
  const ctx = makeBookingCtx(prisma, clinic, client.id);

  let reply: string;
  let nextState: FlowState = state;
  let status = conversation.status;
  let linkedPetId = conversation.petId;
  let understood = true;

  if (conversation.status === ConversationStatus.HUMAN_ACTIVE || conversation.status === ConversationStatus.REQUIRES_HUMAN) {
    reply = "Tu consulta ya está en la bandeja del equipo. Te responderán por este mismo medio.";
  } else if (isUrgent(raw)) {
    reply = URGENT_REPLY;
    status = ConversationStatus.REQUIRES_HUMAN;
    nextState = {};
  } else if (isResetIntent(raw)) {
    reply = `Listo, arrancamos de nuevo. ${buildGreeting(clinic.name)}`;
    nextState = {};
  } else if (state.step && state.step !== "CONFIRM_CANCEL_CHOICE" && isCancelIntent(raw)) {
    reply = "¿Querés cancelar la reserva que estamos armando, o cancelar un turno ya existente?";
    nextState = { step: "CONFIRM_CANCEL_CHOICE" };
  } else if (state.step === "CONFIRM_CANCEL_CHOICE") {
    if (/reserva|armando/i.test(raw)) {
      reply = "Listo, cancelé lo que estábamos armando. Si querés empezar de nuevo, contame qué necesitás.";
      nextState = {};
    } else if (/turno|existente|agendad/i.test(raw)) {
      const appointment = await findActiveAppointment(clinic.id, client.id);
      if (!appointment) reply = "No encontré un turno próximo para cancelar.";
      else {
        await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: appointment.id, status: AppointmentStatus.CANCELLED });
        reply = `Cancelamos el turno de ${appointment.pet.name} del ${formatAppointmentWhen(appointment.startAt, clinic.timezone)}. Si querés reservar otro, contame cuándo te queda bien.`;
      }
      nextState = {};
    } else {
      reply = "Decime si querés cancelar “la reserva” que estamos armando o “un turno” ya existente.";
      understood = false;
    }
  } else if (state.step === "SELECT_PET") {
    const pets = await prisma.pet.findMany({ where: { clinicId: clinic.id, clientId: client.id }, orderBy: { name: "asc" } });
    const selection = matchPetSelection(raw, pets);
    if (selection === "new") {
      reply = "¡Genial! ¿Cómo se llama tu mascota? 🐾";
      nextState = { ...state, step: "NEW_PET_NAME" };
    } else if (selection) {
      const result = await advanceBooking(ctx, { ...state, petId: selection.id, petName: selection.name });
      reply = result.reply;
      nextState = result.nextState;
      status = result.status ?? status;
      if (result.resolvedPetId) linkedPetId = result.resolvedPetId;
    } else {
      reply = "No encontré esa mascota. Escribí su nombre o el número de la lista.";
      understood = false;
    }
  } else if (state.step === "NEW_PET_NAME") {
    const name = raw.slice(0, 80);
    if (!name) {
      reply = "¿Cómo se llama tu mascota? 🐾";
      understood = false;
    } else {
      const pet = await prisma.pet.create({
        data: {
          clinicId: clinic.id,
          clientId: client.id,
          name,
          species: "A confirmar",
          notes: "Registrada desde WhatsApp: completar datos en la clínica",
        },
      });
      const result = await advanceBooking(ctx, { ...state, petId: pet.id, petName: pet.name });
      reply = result.reply;
      nextState = result.nextState;
      status = result.status ?? status;
      linkedPetId = result.resolvedPetId ?? pet.id;
    }
  } else if (state.step === "REASON" && state.petId) {
    const trimmed = raw.trim();
    const reason = REASON_MENU[trimmed] ?? extractReason(raw) ?? (trimmed ? trimmed.slice(0, 120) : null);
    if (!reason) {
      reply = "Contame el motivo del turno (por ejemplo: consulta, vacunación o control).";
      understood = false;
    } else {
      const result = await advanceBooking(ctx, { ...state, reason });
      reply = result.reply;
      nextState = result.nextState;
      status = result.status ?? status;
      if (result.resolvedPetId) linkedPetId = result.resolvedPetId;
    }
  } else if (state.step === "AWAIT_DATE" && state.petId && state.reason) {
    const parsedDate = isAsapIntent(raw) ? DateTime.now().setZone(clinic.timezone).toFormat("yyyy-MM-dd") : parseNaturalDate(raw, clinic.timezone);
    if (!parsedDate) {
      reply = 'No entendí bien la fecha. Podés decirme "mañana", "el lunes" o una fecha como 15/07.';
      understood = false;
    } else {
      const result = await advanceBooking(ctx, { ...state, date: parsedDate });
      reply = result.reply;
      nextState = result.nextState;
      status = result.status ?? status;
      if (result.resolvedPetId) linkedPetId = result.resolvedPetId;
    }
  } else if (state.step === "AWAIT_ALTERNATIVES" && state.petId && state.reason && state.offeredSlots) {
    const selection = resolveAlternativeSelection(raw, state.offeredSlots, clinic.timezone);
    if (!selection) {
      reply = `No entendí cuál preferís. Te puedo ofrecer: ${describeAlternatives(state.offeredSlots, clinic.timezone)}. ¿Cuál te queda bien?`;
      understood = false;
    } else if (selection.kind === "slot") {
      const result = await finalizeBooking(ctx, state, selection.date, selection.time);
      reply = result.reply;
      nextState = result.nextState;
      status = result.status ?? status;
      if (result.resolvedPetId) linkedPetId = result.resolvedPetId;
    } else {
      reply = timeMenuReply(selection.date, selection.times, state.petName, clinic.timezone);
      nextState = { ...state, step: "AWAIT_TIME", date: selection.date, offeredTimes: selection.times };
      linkedPetId = state.petId;
    }
  } else if (state.step === "AWAIT_TIME" && state.petId && state.reason && state.date && state.offeredTimes) {
    const time = resolveTimeChoice(raw, state.offeredTimes);
    if (!time) {
      reply = `No encontré ese horario. ${timeMenuReply(state.date, state.offeredTimes, state.petName, clinic.timezone)}`;
      understood = false;
    } else {
      const result = await finalizeBooking(ctx, state, state.date, time);
      reply = result.reply;
      nextState = result.nextState;
      status = result.status ?? status;
      if (result.resolvedPetId) linkedPetId = result.resolvedPetId;
    }
  } else if (state.step === "RESCHEDULE_AWAIT_DATE" && state.rescheduleAppointmentId) {
    if (requiresHuman(raw)) {
      reply = NON_URGENT_DERIVE_REPLY;
      status = ConversationStatus.REQUIRES_HUMAN;
      nextState = {};
    } else {
      const appointment = await prisma.appointment.findFirst({ where: { id: state.rescheduleAppointmentId, clinicId: clinic.id }, include: { pet: true } });
      if (!appointment) {
        reply = "Ese turno ya no está disponible para reprogramar. Contame si querés reservar uno nuevo.";
        nextState = {};
      } else {
        const parsedDate = isAsapIntent(raw) ? DateTime.now().setZone(clinic.timezone).toFormat("yyyy-MM-dd") : parseNaturalDate(raw, clinic.timezone);
        if (!parsedDate) {
          reply = 'No entendí bien la fecha. Podés decirme "mañana", "el lunes" o una fecha como 15/07.';
          understood = false;
        } else {
          const rescheduleCtx = makeRescheduleCtx(prisma, clinic, client.id, appointment.veterinarianId);
          const result = await resolveDateAvailability(
            rescheduleCtx,
            { ...state, petName: appointment.pet.name, date: parsedDate },
            { kind: "reschedule", appointmentId: appointment.id }
          );
          reply = result.reply;
          nextState = result.nextState;
          status = result.status ?? status;
        }
      }
    }
  } else if (state.step === "RESCHEDULE_AWAIT_ALTERNATIVES" && state.rescheduleAppointmentId && state.offeredSlots) {
    if (requiresHuman(raw)) {
      reply = NON_URGENT_DERIVE_REPLY;
      status = ConversationStatus.REQUIRES_HUMAN;
      nextState = {};
    } else {
      const selection = resolveAlternativeSelection(raw, state.offeredSlots, clinic.timezone);
      if (!selection) {
        reply = `No entendí cuál preferís. Te puedo ofrecer: ${describeAlternatives(state.offeredSlots, clinic.timezone)}. ¿Cuál te queda bien?`;
        understood = false;
      } else {
        const appointment = await prisma.appointment.findFirst({ where: { id: state.rescheduleAppointmentId, clinicId: clinic.id }, include: { pet: true } });
        if (!appointment) {
          reply = "Ese turno ya no está disponible para reprogramar. Contame si querés reservar uno nuevo.";
          nextState = {};
        } else {
          const rescheduleCtx = makeRescheduleCtx(prisma, clinic, client.id, appointment.veterinarianId);
          const mode: BookingMode = { kind: "reschedule", appointmentId: appointment.id };
          if (selection.kind === "slot") {
            const result = await finalizeBooking(rescheduleCtx, { ...state, petName: appointment.pet.name }, selection.date, selection.time, mode);
            reply = result.reply;
            nextState = result.nextState;
            status = result.status ?? status;
          } else {
            reply = timeMenuReply(selection.date, selection.times, appointment.pet.name, clinic.timezone);
            nextState = { ...state, step: "RESCHEDULE_AWAIT_TIME", date: selection.date, offeredTimes: selection.times };
          }
        }
      }
    }
  } else if (state.step === "RESCHEDULE_AWAIT_TIME" && state.rescheduleAppointmentId && state.date && state.offeredTimes) {
    if (requiresHuman(raw)) {
      reply = NON_URGENT_DERIVE_REPLY;
      status = ConversationStatus.REQUIRES_HUMAN;
      nextState = {};
    } else {
      const time = resolveTimeChoice(raw, state.offeredTimes);
      if (!time) {
        reply = `No encontré ese horario. ${timeMenuReply(state.date, state.offeredTimes, state.petName, clinic.timezone)}`;
        understood = false;
      } else {
        const appointment = await prisma.appointment.findFirst({ where: { id: state.rescheduleAppointmentId, clinicId: clinic.id }, include: { pet: true } });
        if (!appointment) {
          reply = "Ese turno ya no está disponible para reprogramar. Contame si querés reservar uno nuevo.";
          nextState = {};
        } else {
          const rescheduleCtx = makeRescheduleCtx(prisma, clinic, client.id, appointment.veterinarianId);
          const result = await finalizeBooking(
            rescheduleCtx,
            { ...state, petName: appointment.pet.name },
            state.date,
            time,
            { kind: "reschedule", appointmentId: appointment.id }
          );
          reply = result.reply;
          nextState = result.nextState;
          status = result.status ?? status;
        }
      }
    }
  } else if (isConfirmIntent(raw) || raw === "2") {
    // Se revisan antes que isBookingIntent: frases como "cambiar el turno" o "cancelar mi turno"
    // también contienen la palabra "turno" y no deben interpretarse como una reserva nueva.
    const appointment = await findActiveAppointment(clinic.id, client.id);
    if (!appointment) reply = "No encontré un turno próximo para confirmar.";
    else {
      await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: appointment.id, status: AppointmentStatus.CONFIRMED });
      reply = `Confirmamos el turno de ${appointment.pet.name} del ${formatAppointmentWhen(appointment.startAt, clinic.timezone)}. ¡Te esperamos! 🐾`;
    }
  } else if (isRescheduleIntent(raw) || raw === "3") {
    const appointment = await findActiveAppointment(clinic.id, client.id);
    if (!appointment) reply = "No encontré un turno próximo para reprogramar.";
    else {
      reply = `Tu turno de ${appointment.pet.name} es el ${formatAppointmentWhen(appointment.startAt, clinic.timezone)}. ¿Para qué día preferís pasarlo? Podés decirme "mañana", "el lunes" o una fecha como 15/07 (o escribime si preferís hablar con alguien).`;
      nextState = { step: "RESCHEDULE_AWAIT_DATE", rescheduleAppointmentId: appointment.id, petName: appointment.pet.name };
    }
  } else if (isCancelIntent(raw) || raw === "4") {
    const appointment = await findActiveAppointment(clinic.id, client.id);
    if (!appointment) reply = "No encontré un turno próximo para cancelar.";
    else {
      await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: appointment.id, status: AppointmentStatus.CANCELLED });
      reply = `Cancelamos el turno de ${appointment.pet.name} del ${formatAppointmentWhen(appointment.startAt, clinic.timezone)}. Si querés reservar otro, contame cuándo te queda bien.`;
    }
  } else if (isCheckAvailabilityIntent(raw)) {
    // Respuesta rápida típica a un recordatorio de control: mismo mecanismo que una reserva nueva,
    // arrancando ya con el motivo "Control" y buscando el horario más próximo real.
    const result = await startFreshBooking(ctx, "control cuanto antes");
    reply = result.reply;
    nextState = result.nextState;
    status = result.status ?? status;
    if (result.resolvedPetId) linkedPetId = result.resolvedPetId;
  } else if (isBookingIntent(raw) || raw === "1") {
    const result = await startFreshBooking(ctx, raw);
    reply = result.reply;
    nextState = result.nextState;
    status = result.status ?? status;
    if (result.resolvedPetId) linkedPetId = result.resolvedPetId;
  } else if (raw === "5") {
    reply = NON_URGENT_DERIVE_REPLY;
    status = ConversationStatus.REQUIRES_HUMAN;
    nextState = {};
  } else if (requiresHuman(raw)) {
    reply = NON_URGENT_DERIVE_REPLY;
    status = ConversationStatus.REQUIRES_HUMAN;
    nextState = {};
  } else if (isGreeting(raw)) {
    reply = buildGreeting(clinic.name);
  } else {
    reply = buildGreeting(clinic.name);
    understood = false;
  }

  if (!understood) {
    const count = (state.misunderstoodCount ?? 0) + 1;
    if (count >= 2) {
      reply = NOT_UNDERSTOOD_TWICE_REPLY;
      status = ConversationStatus.REQUIRES_HUMAN;
      nextState = {};
    } else {
      nextState = { ...nextState, misunderstoodCount: count };
    }
  } else if (nextState.misunderstoodCount) {
    nextState = Object.fromEntries(Object.entries(nextState).filter(([key]) => key !== "misunderstoodCount"));
  }

  const [, outboundMessage] = await prisma.$transaction([
    prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { status, flowState: nextState, petId: linkedPetId } }),
    // Todas las respuestas (automáticas o humanas) pasan por la misma outbox. El worker las
    // reclama, reintenta y registra sus confirmaciones de entrega.
    prisma.whatsappMessage.create({ data: { clinicId: clinic.id, conversationId: conversation.id, direction: "OUTBOUND", content: reply, status: "HUMAN_QUEUED" } }),
    prisma.webhookEvent.update({ where: { clinicId_externalEventId: { clinicId: clinic.id, externalEventId: event.eventId } }, data: { processedAt: new Date() } }),
  ]);

  return { accepted: true, reply, outboundMessageId: outboundMessage.id };
}
