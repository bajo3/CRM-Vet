import { describe, expect, it } from "vitest";
import { isBookingIntent, isCancelIntent, requiresHuman } from "./intent";

describe("intenciones de WhatsApp", () => {
  it("detecta una reserva", () => expect(isBookingIntent("Quiero un turno para Lola")).toBe(true));
  it("detecta una cancelación", () => expect(isCancelIntent("Necesito cancelar")).toBe(true));
  it.each(["mi perro vomita", "es una urgencia", "quiero hablar con una persona", "tengo un reclamo"])("deriva consultas no administrativas: %s", (text) => expect(requiresHuman(text)).toBe(true));
  it("no deriva una reserva normal", () => expect(requiresHuman("Quiero reservar un turno")).toBe(false));
});

