import { describe, expect, it } from "vitest";
import {
  extractReason,
  isAsapIntent,
  isBookingIntent,
  isCancelIntent,
  isConfirmIntent,
  isGreeting,
  isRescheduleIntent,
  isResetIntent,
  isUrgent,
  requiresHuman,
} from "./intent";

describe("intenciones de WhatsApp", () => {
  it("detecta una reserva", () => expect(isBookingIntent("Quiero un turno para Lola")).toBe(true));
  it("detecta una reserva en una frase con 'necesito llevar'", () => expect(isBookingIntent("necesito llevar al perro el lunes")).toBe(true));
  it("detecta una cancelación", () => expect(isCancelIntent("Necesito cancelar")).toBe(true));
  it("detecta una cancelación conjugada ('cancelame el turno')", () => expect(isCancelIntent("cancelame el turno")).toBe(true));
  it.each(["mi perro vomita", "es una urgencia", "quiero hablar con una persona", "tengo un reclamo"])(
    "deriva consultas no administrativas: %s",
    (text) => expect(requiresHuman(text)).toBe(true)
  );
  it("no deriva una reserva normal", () => expect(requiresHuman("Quiero reservar un turno")).toBe(false));

  it.each(["mi perro se comió veneno", "se está muriendo", "está convulsionando", "lo atropellaron", "no respira", "vomita sangre", "tuvo un accidente"])(
    "detecta urgencias veterinarias reales: %s",
    (text) => expect(isUrgent(text)).toBe(true)
  );
  it("no marca una consulta de rutina como urgencia", () => expect(isUrgent("quiero un turno para un control")).toBe(false));

  it("detecta un pedido de reprogramación ('puedo cambiar el turno?')", () => expect(isRescheduleIntent("puedo cambiar el turno?")).toBe(true));
  it("no confunde una reserva nueva con una reprogramación", () => expect(isRescheduleIntent("quiero reservar un turno")).toBe(false));

  it("detecta confirmaciones simples", () => {
    expect(isConfirmIntent("sí")).toBe(true);
    expect(isConfirmIntent("dale")).toBe(true);
  });
  it("no confunde una frase larga con una confirmación", () => expect(isConfirmIntent("sí, quiero cancelar")).toBe(false));

  it("detecta 'cuanto antes'", () => expect(isAsapIntent("¿tenés algo cuanto antes?")).toBe(true));
  it("detecta 'lo antes posible'", () => expect(isAsapIntent("lo antes posible por favor")).toBe(true));

  it("detecta comandos de reinicio ('salir', 'menu')", () => {
    expect(isResetIntent("salir")).toBe(true);
    expect(isResetIntent("menu")).toBe(true);
    expect(isResetIntent("menú")).toBe(true);
  });
  it("no confunde una frase con la palabra menu con un reset", () => expect(isResetIntent("quiero ver el menu de turnos")).toBe(false));

  it("detecta saludos", () => expect(isGreeting("Hola, buenas tardes")).toBe(true));

  it("extrae el motivo de una frase libre", () => {
    expect(extractReason("necesito una vacuna para mi gato")).toBe("Vacunación");
    expect(extractReason("es para un control")).toBe("Control");
    expect(extractReason("quiero una consulta")).toBe("Consulta");
    expect(extractReason("quiero un turno para mañana")).toBeNull();
  });
});
