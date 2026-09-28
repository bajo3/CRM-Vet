import { getPrisma } from "../prisma";
import { normalizePhone } from "../phone";

/**
 * Puerto de envío de WhatsApp. El motor de recordatorios depende únicamente de esta interfaz,
 * por lo que cambiar de proveedor no requiere tocar `reminders.ts`: alcanza con implementar
 * `WhatsAppProvider` y pasar esa instancia a `processDueReminders`.
 *
 * `clinicId` viaja en el llamado (no en el constructor del proveedor) porque `processDueReminders`
 * procesa recordatorios vencidos de todas las clínicas en una misma corrida con una única
 * instancia de proveedor.
 */
export interface WhatsAppProvider {
  sendText(params: { clinicId: string; phone: string; text: string; clientId?: string }): Promise<{
    externalMessageId: string;
    /**
     * `true` cuando el propio proveedor ya dejó registrado el `WhatsappMessage` saliente (es el
     * caso de `OutboxWhatsAppProvider`, que necesita crear esa fila para que la outbox la despache).
     * En ese caso el llamador no debe volver a registrar el mensaje para no duplicarlo.
     */
    messageAlreadyRecorded?: boolean;
  }>;
}

function mockMessageId(): string {
  return `mock-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Proveedor de prueba: no envía nada real, solo genera un id y deja un log sin datos sensibles. */
export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendText({ phone, text }: { clinicId: string; phone: string; text: string; clientId?: string }): Promise<{ externalMessageId: string }> {
    const externalMessageId = mockMessageId();
    const maskedPhone = phone.length > 4 ? `***${phone.slice(-4)}` : "***";
    console.log(`[MockWhatsAppProvider] envío simulado a ${maskedPhone} (${text.length} caracteres) -> ${externalMessageId}`);
    return { externalMessageId };
  }
}

/**
 * Proveedor de producción "outbox": no envía nada directamente, sino que encola el mensaje como
 * `WhatsappMessage` OUTBOUND en estado `HUMAN_QUEUED` -el mismo estado que usan las respuestas
 * humanas desde `/mensajes`- para que lo despache `dispatchZernioOutbox`.
 *
 * A propósito NO toca `status`/`assignedUserId` de la conversación: es un mensaje automático del
 * sistema, no una respuesta humana, así que la conversación no debe pasar a `HUMAN_ACTIVE` ni
 * quedar asignada a nadie. Solo actualiza `lastMessageAt`.
 */
export class OutboxWhatsAppProvider implements WhatsAppProvider {
  async sendText({ clinicId, phone, text, clientId }: { clinicId: string; phone: string; text: string; clientId?: string }): Promise<{
    externalMessageId: string;
    messageAlreadyRecorded: true;
  }> {
    const prisma = getPrisma();
    const normalizedPhone = normalizePhone(phone);

    const conversation = await prisma.whatsappConversation.upsert({
      where: { clinicId_phone: { clinicId, phone: normalizedPhone } },
      create: { clinicId, phone: normalizedPhone, clientId: clientId ?? null },
      update: { lastMessageAt: new Date() },
    });

    const message = await prisma.whatsappMessage.create({
      data: {
        clinicId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: text,
        status: "HUMAN_QUEUED",
      },
    });

    return { externalMessageId: message.id, messageAlreadyRecorded: true };
  }
}
