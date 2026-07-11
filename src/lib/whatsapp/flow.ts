import { AppointmentStatus, ConversationStatus, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { getPrisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { getAvailableSlots } from "@/lib/services/availability";
import { createAppointment, updateAppointmentStatus } from "@/lib/services/appointments";
import { AppointmentConflictError } from "@/lib/services/errors";
import type { IncomingWhatsappEvent, WhatsappEventResponse } from "./contracts";
import { isBookingIntent, isCancelIntent, isConfirmIntent, MENU, requiresHuman } from "./intent";

type FlowState = {
  step?: "SELECT_PET" | "NEW_PET_NAME" | "NEW_PET_SPECIES" | "REASON" | "DATE" | "TIME";
  petId?: string;
  petName?: string;
  reason?: string;
  date?: string;
};

function asFlowState(value: Prisma.JsonValue | null): FlowState {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as FlowState) : {};
}

function localDateTime(date: string, time: string, timezone: string) {
  return DateTime.fromISO(`${date}T${time}`, { zone: timezone }).toUTC().toJSDate();
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
  let reply = MENU;
  let nextState: FlowState = state;
  let status = conversation.status;
  let linkedPetId = conversation.petId;
  const text = event.text.trim();

  if (conversation.status === ConversationStatus.HUMAN_ACTIVE || conversation.status === ConversationStatus.REQUIRES_HUMAN) {
    reply = "Tu consulta ya está en la bandeja del equipo. Te responderán por este mismo medio.";
  } else if (requiresHuman(text) || text === "5") {
    reply = "Voy a derivar tu consulta a la veterinaria. Si es una emergencia, acudí de inmediato a una guardia veterinaria.";
    status = ConversationStatus.REQUIRES_HUMAN;
    nextState = {};
  } else if (state.step === "SELECT_PET") {
    if (/nueva/i.test(text)) {
      reply = "¿Cómo se llama la mascota?";
      nextState = { step: "NEW_PET_NAME" };
    } else {
      const pets = await prisma.pet.findMany({ where: { clinicId: clinic.id, clientId: client.id } });
      const wantsNewPet = /nueva/i.test(text) || Number(text) === pets.length + 1;
      const pet = pets.find((item) => item.name.toLowerCase() === text.toLowerCase()) || pets[Number(text) - 1];
      if (wantsNewPet) {
        reply = "¿Cómo se llama la mascota?";
        nextState = { step: "NEW_PET_NAME" };
      } else if (!pet) reply = "No encontré esa mascota. Escribí su nombre o respondé “Nueva mascota”.";
      else {
        linkedPetId = pet.id;
        reply = "¿Cuál es el motivo?\n\n1. Consulta\n2. Vacunación\n3. Control\n4. Otro";
        nextState = { step: "REASON", petId: pet.id };
      }
    }
  } else if (state.step === "NEW_PET_NAME") {
    reply = `¿Qué especie es ${text}? (por ejemplo: perro o gato)`;
    nextState = { step: "NEW_PET_SPECIES", petName: text.slice(0, 80) };
  } else if (state.step === "NEW_PET_SPECIES" && state.petName) {
    const pet = await prisma.pet.create({ data: { clinicId: clinic.id, clientId: client.id, name: state.petName, species: text.slice(0, 60) } });
    linkedPetId = pet.id;
    reply = "¿Cuál es el motivo?\n\n1. Consulta\n2. Vacunación\n3. Control\n4. Otro";
    nextState = { step: "REASON", petId: pet.id };
  } else if (state.step === "REASON" && state.petId) {
    const reasons: Record<string, string> = { "1": "Consulta", "2": "Vacunación", "3": "Control", "4": "Otro" };
    reply = "¿Qué día preferís? Escribilo como AAAA-MM-DD.";
    nextState = { step: "DATE", petId: state.petId, reason: reasons[text] || text.slice(0, 120) };
  } else if (state.step === "DATE" && state.petId && state.reason) {
    const requestedDay = DateTime.fromISO(text, { zone: clinic.timezone });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !requestedDay.isValid || requestedDay.endOf("day").toUTC().toJSDate() < new Date()) {
      reply = "Necesito una fecha futura con formato AAAA-MM-DD, por ejemplo 2026-07-15.";
    } else {
      const veterinarian = await prisma.clinicMember.findFirst({ where: { clinicId: clinic.id, role: "VETERINARIAN", active: true } });
      if (!veterinarian) throw new Error("NO_VETERINARIAN_CONFIGURED");
      const times = await getAvailableSlots(clinic, veterinarian.userId, text);
      reply = times.length ? `Horarios disponibles: ${times.join(", ")}. ¿Cuál preferís?` : "No quedan horarios disponibles ese día. Elegí otra fecha con formato AAAA-MM-DD.";
      nextState = times.length ? { ...state, step: "TIME", date: text } : state;
    }
  } else if (state.step === "TIME" && state.petId && state.reason && state.date) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
      reply = "Escribí el horario como HH:MM, por ejemplo 16:00.";
    } else {
      const veterinarian = await prisma.clinicMember.findFirst({ where: { clinicId: clinic.id, role: "VETERINARIAN", active: true } });
      if (!veterinarian) throw new Error("NO_VETERINARIAN_CONFIGURED");
      const times = await getAvailableSlots(clinic, veterinarian.userId, state.date);
      if (!times.includes(text)) {
        reply = times.length ? `Ese horario no está disponible. Elegí uno de estos: ${times.join(", ")}.` : "Ya no quedan horarios disponibles ese día. Escribí “turno” para elegir otra fecha.";
        nextState = times.length ? state : {};
        await prisma.$transaction([
          prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { flowState: nextState } }),
          prisma.whatsappMessage.create({ data: { clinicId: clinic.id, conversationId: conversation.id, direction: "OUTBOUND", content: reply, status: "QUEUED" } }),
          prisma.webhookEvent.update({ where: { clinicId_externalEventId: { clinicId: clinic.id, externalEventId: event.eventId } }, data: { processedAt: new Date() } }),
        ]);
        return { accepted: true, reply };
      }
      const startAt = localDateTime(state.date, text, clinic.timezone);
      const endAt = new Date(startAt.getTime() + clinic.defaultAppointmentDuration * 60_000);
      try {
        await createAppointment({
          clinicId: clinic.id,
          petId: state.petId,
          veterinarianId: veterinarian.userId,
          reason: state.reason,
          startAt,
          endAt,
          source: "WHATSAPP",
        });
        reply = `¡Listo! Reservamos el turno para el ${state.date} a las ${text}. Quedó pendiente de confirmación.`;
        nextState = {};
      } catch (error) {
        if (error instanceof AppointmentConflictError) {
          const remainingTimes = await getAvailableSlots(clinic, veterinarian.userId, state.date);
          reply = remainingTimes.length ? `Ese horario acaba de ocuparse. Elegí otro: ${remainingTimes.join(", ")}.` : "Ese horario acaba de ocuparse y ya no quedan más ese día. Escribí “turno” para elegir otra fecha.";
        } else throw error;
      }
    }
  } else if (isBookingIntent(text) || text === "1") {
    const pets = await prisma.pet.findMany({ where: { clinicId: clinic.id, clientId: client.id }, orderBy: { name: "asc" } });
    reply = pets.length
      ? `¿Para cuál mascota?\n\n${pets.map((pet, index) => `${index + 1}. ${pet.name}`).join("\n")}\n${pets.length + 1}. Nueva mascota`
      : "Todavía no registramos una mascota. Respondé “Nueva mascota” para comenzar.";
    nextState = { step: "SELECT_PET" };
  } else if (isConfirmIntent(text) || text === "2") {
    const appointment = await findActiveAppointment(clinic.id, client.id);
    if (!appointment) reply = "No encontré un turno próximo para confirmar.";
    else {
      await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: appointment.id, status: AppointmentStatus.CONFIRMED });
      reply = `Confirmamos el turno de ${appointment.pet.name}. ¡Te esperamos!`;
    }
  } else if (isCancelIntent(text) || text === "4") {
    const appointment = await findActiveAppointment(clinic.id, client.id);
    if (!appointment) reply = "No encontré un turno próximo para cancelar.";
    else {
      await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: appointment.id, status: AppointmentStatus.CANCELLED });
      reply = `Cancelamos el turno de ${appointment.pet.name}. Si querés reservar otro, escribí “turno”.`;
    }
  } else if (/cambiar|reprogramar/i.test(text) || text === "3") {
    reply = "Voy a derivarte con recepción para reprogramar el turno sin perder tus datos.";
    status = ConversationStatus.REQUIRES_HUMAN;
    nextState = {};
  }

  await prisma.$transaction([
    prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { status, flowState: nextState, petId: linkedPetId } }),
    prisma.whatsappMessage.create({ data: { clinicId: clinic.id, conversationId: conversation.id, direction: "OUTBOUND", content: reply, status: "QUEUED" } }),
    prisma.webhookEvent.update({ where: { clinicId_externalEventId: { clinicId: clinic.id, externalEventId: event.eventId } }, data: { processedAt: new Date() } }),
  ]);

  return { accepted: true, reply };
}
