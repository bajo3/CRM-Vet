import { z } from "zod";

export const incomingWhatsappEventSchema = z.object({
  eventId: z.string().min(1).max(160),
  clinicKey: z.string().min(1).max(100),
  phone: z.string().min(6).max(30),
  contactName: z.string().max(120).optional(),
  text: z.string().min(1).max(3000),
  timestamp: z.string().datetime(),
});

export type IncomingWhatsappEvent = z.infer<typeof incomingWhatsappEventSchema>;

export type WhatsappEventResponse = {
  accepted: boolean;
  duplicate?: boolean;
  reply?: string;
};
