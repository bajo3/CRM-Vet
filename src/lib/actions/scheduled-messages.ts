"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { getPrisma } from "../prisma";
import { getSession, hasRole } from "../auth/session";
import { CLIENT_MANAGE_ROLES } from "../auth/roles";
import {
  createScheduledMessageSchema,
  cancelScheduledMessageSchema,
  type CreateScheduledMessageValues,
} from "../validation/scheduled-messages";
import type { ActionResult, ActionFailure } from "./types";

const NOT_AUTHORIZED: ActionFailure = { ok: false, message: "No tenés permisos para programar mensajes." };
const NO_SESSION: ActionFailure = { ok: false, message: "Tu sesión expiró. Iniciá sesión nuevamente." };

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function revalidateMensajes() {
  revalidatePath("/mensajes");
  revalidatePath("/clientes");
}

export type CreateScheduledMessageResult = ActionResult<{ id: string }>;

/**
 * Programa un mensaje de WhatsApp de texto libre para un cliente de la clínica, en una fecha/hora
 * futura elegida a mano. Lo procesa después `processDueScheduledMessages` (mismo worker de
 * recordatorios, cada 60s). `date`/`time` se combinan con la zona horaria de la clínica acá (no en
 * el schema de zod) porque recién acá se conoce esa zona horaria.
 */
export async function createScheduledMessage(input: CreateScheduledMessageValues): Promise<CreateScheduledMessageResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = createScheduledMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const prisma = getPrisma();
  const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, clinicId: session.clinicId } });
  if (!client) return { ok: false, message: "No encontramos ese cliente.", fieldErrors: { clientId: "Elegí un cliente válido." } };

  const clinic = await prisma.clinic.findUnique({ where: { id: session.clinicId } });
  if (!clinic) return { ok: false, message: "No encontramos la clínica." };

  const scheduledAt = DateTime.fromISO(`${parsed.data.date}T${parsed.data.time}`, { zone: clinic.timezone }).toUTC().toJSDate();
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, message: "Revisá la fecha y el horario.", fieldErrors: { date: "Fecha u horario inválidos." } };
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return { ok: false, message: "Elegí una fecha y horario futuros.", fieldErrors: { date: "Tiene que ser una fecha futura." } };
  }

  const created = await prisma.scheduledMessage.create({
    data: {
      clinicId: session.clinicId,
      clientId: client.id,
      userId: session.userId,
      content: parsed.data.content,
      scheduledAt,
    },
  });

  revalidateMensajes();
  return { ok: true, id: created.id };
}

export type CancelScheduledMessageResult = ActionResult;

/** Cancela un mensaje programado, solo si sigue PENDING y pertenece a la clínica de la sesión. */
export async function cancelScheduledMessage(id: string): Promise<CancelScheduledMessageResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = cancelScheduledMessageSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "Revisá los datos ingresados." };

  const prisma = getPrisma();
  const result = await prisma.scheduledMessage.updateMany({
    where: { id: parsed.data, clinicId: session.clinicId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (result.count === 0) {
    return { ok: false, message: "Ese mensaje ya no está pendiente o no existe." };
  }

  revalidateMensajes();
  return { ok: true };
}
