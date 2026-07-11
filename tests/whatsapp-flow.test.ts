import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { processIncomingWhatsapp } from "../src/lib/whatsapp/flow";
import { resetDatabase, prisma } from "./setup/db";

async function createWhatsappClinic() {
  return prisma.clinic.create({
    data: {
      name: "Clínica WhatsApp de prueba",
      timezone: "America/Argentina/Buenos_Aires",
      defaultAppointmentDuration: 30,
      whatsappSessionKey: `test-${randomUUID()}`,
      openingHours: {
        monday: ["09:00", "18:00"],
        tuesday: ["09:00", "18:00"],
        wednesday: ["09:00", "18:00"],
        thursday: ["09:00", "18:00"],
        friday: ["09:00", "18:00"],
        saturday: ["09:00", "18:00"],
        sunday: ["09:00", "18:00"],
      },
    },
  });
}

function baseEvent(clinicKey: string, overrides: Partial<{ eventId: string; phone: string; text: string }> = {}) {
  return {
    eventId: overrides.eventId ?? randomUUID(),
    clinicKey,
    phone: overrides.phone ?? "5491100000001",
    contactName: "Contacto de prueba",
    text: overrides.text ?? "hola",
    timestamp: new Date().toISOString(),
  };
}

describe("flow de WhatsApp", () => {
  beforeEach(resetDatabase);

  it("un evento duplicado (mismo eventId) no se procesa dos veces", async () => {
    const clinic = await createWhatsappClinic();
    const event = baseEvent(clinic.whatsappSessionKey!, { text: "turno" });

    const first = await processIncomingWhatsapp(event);
    expect(first.duplicate).toBeFalsy();

    const second = await processIncomingWhatsapp(event);
    expect(second.duplicate).toBe(true);

    const inboundMessages = await prisma.whatsappMessage.count({ where: { clinicId: clinic.id, direction: "INBOUND" } });
    expect(inboundMessages).toBe(1);
  });

  it("una consulta médica deriva la conversación a REQUIRES_HUMAN sin ofrecer diagnóstico", async () => {
    const clinic = await createWhatsappClinic();
    const event = baseEvent(clinic.whatsappSessionKey!, { text: "mi perro vomita mucho desde ayer" });

    const response = await processIncomingWhatsapp(event);
    expect(response.reply).toMatch(/derivar/i);

    const conversation = await prisma.whatsappConversation.findFirstOrThrow({ where: { clinicId: clinic.id } });
    expect(conversation.status).toBe("REQUIRES_HUMAN");
  });
});
