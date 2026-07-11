/**
 * Puerto de envío de WhatsApp. El motor de recordatorios depende únicamente de esta interfaz,
 * por lo que enchufar Baileys (u otro proveedor real) en otra etapa no requiere tocar
 * `reminders.ts`: alcanza con implementar `WhatsAppProvider` y pasar esa instancia a
 * `processDueReminders`.
 */
export interface WhatsAppProvider {
  sendText(phone: string, text: string): Promise<{ externalMessageId: string }>;
}

function mockMessageId(): string {
  return `mock-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Proveedor de prueba: no envía nada real, solo genera un id y deja un log sin datos sensibles. */
export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendText(phone: string, text: string): Promise<{ externalMessageId: string }> {
    const externalMessageId = mockMessageId();
    const maskedPhone = phone.length > 4 ? `***${phone.slice(-4)}` : "***";
    console.log(`[MockWhatsAppProvider] envío simulado a ${maskedPhone} (${text.length} caracteres) -> ${externalMessageId}`);
    return { externalMessageId };
  }
}
