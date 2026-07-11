"use server";
import { revalidatePath } from "next/cache";
import { ConversationStatus } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";
import type { ActionResult } from "./types";

async function ownedConversation(id: string, clinicId: string) { return getPrisma().whatsappConversation.findFirst({ where: { id, clinicId }, select: { id: true } }); }
export async function openConversation(id: string): Promise<void> {
  const session = await getSession(); if (!session) return;
  if (!await ownedConversation(id, session.clinicId)) return;
  await getPrisma().whatsappConversation.update({ where: { id }, data: { status: ConversationStatus.HUMAN_ACTIVE, assignedUserId: session.userId, unreadCount: 0 } });
  revalidatePath("/mensajes");
}
export async function resolveConversation(id: string): Promise<void> {
  const session = await getSession(); if (!session) return;
  if (!await ownedConversation(id, session.clinicId)) return;
  await getPrisma().whatsappConversation.update({ where: { id }, data: { status: ConversationStatus.RESOLVED, flowState: {}, unreadCount: 0 } });
  revalidatePath("/mensajes");
}
export async function sendHumanReply(id: string, content: string): Promise<ActionResult> {
  const session = await getSession(); if (!session) return { ok: false, message: "Tu sesion expiro." };
  const text = content.trim();
  if (!await ownedConversation(id, session.clinicId)) return { ok: false, message: "Conversacion no encontrada." };
  if (!text || text.length > 2000) return { ok: false, message: "Escribi un mensaje de hasta 2000 caracteres." };
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.whatsappMessage.create({ data: { clinicId: session.clinicId, conversationId: id, direction: "OUTBOUND", content: text, status: "HUMAN_QUEUED" } }),
    prisma.whatsappConversation.update({ where: { id }, data: { status: ConversationStatus.HUMAN_ACTIVE, assignedUserId: session.userId, unreadCount: 0, lastMessageAt: new Date() } }),
  ]);
  revalidatePath("/mensajes"); return { ok: true };
}


