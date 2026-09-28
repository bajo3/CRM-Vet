/** Mensaje entrante de WhatsApp ya normalizado, independiente del canal por el que llegó. */
export type IncomingWhatsappEvent = {
  eventId: string;
  phone: string;
  contactName?: string;
  text: string;
  timestamp: string;
};

export type WhatsappEventResponse = {
  accepted: boolean;
  duplicate?: boolean;
  reply?: string;
  outboundMessageId?: string;
};
