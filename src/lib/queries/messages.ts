import type { ConversationStatus } from "@prisma/client";
import { getPrisma } from "../prisma";

// Lo que necesita la lista de conversaciones: nada de mensajes completos, solo el último para la
// vista previa. Antes se traían hasta 100 mensajes por cada una de las 50 conversaciones (hasta
// 5000 filas de WhatsappMessage) solo para mostrar una línea de preview por conversación.
export async function listConversationsForInbox(clinicId: string, status?: ConversationStatus) {
  const prisma = getPrisma();
  return prisma.whatsappConversation.findMany({
    where: { clinicId, ...(status ? { status } : {}) },
    select: {
      id: true,
      status: true,
      contactName: true,
      phone: true,
      lastMessageAt: true,
      unreadCount: true,
      client: { select: { name: true } },
      pet: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, direction: true },
      },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });
}

export type ConversationListItem = Awaited<ReturnType<typeof listConversationsForInbox>>[number];

/** Detalle completo de UNA conversación (para el panel derecho): hasta 100 mensajes del hilo. */
export async function getConversationDetail(clinicId: string, conversationId: string) {
  const prisma = getPrisma();
  return prisma.whatsappConversation.findFirst({
    where: { id: conversationId, clinicId },
    select: {
      id: true,
      status: true,
      contactName: true,
      phone: true,
      unreadCount: true,
      client: { select: { name: true } },
      pet: { select: { id: true, name: true } },
      assignedUser: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, content: true, direction: true, status: true, createdAt: true },
      },
    },
  });
}

export type ConversationDetail = Awaited<ReturnType<typeof getConversationDetail>>;
