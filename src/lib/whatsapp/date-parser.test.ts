import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { describeDate, joinTimes, parseNaturalDate, parseNaturalTime, weekdayLabel } from "./date-parser";

const TZ = "America/Argentina/Buenos_Aires";
// Sábado 11/07/2026 12:00 hora local, usado como "ahora" inyectado en todos los tests.
const NOW = DateTime.fromISO("2026-07-11T12:00:00", { zone: TZ });

describe("parseNaturalDate", () => {
  it("entiende 'hoy'", () => {
    expect(parseNaturalDate("hoy", TZ, NOW)).toBe("2026-07-11");
  });

  it("entiende 'mañana' con tilde", () => {
    expect(parseNaturalDate("quiero un turno para mañana", TZ, NOW)).toBe("2026-07-12");
  });

  it("entiende 'manana' sin tilde", () => {
    expect(parseNaturalDate("manana estaria bien", TZ, NOW)).toBe("2026-07-12");
  });

  it("entiende 'pasado mañana'", () => {
    expect(parseNaturalDate("pasado mañana", TZ, NOW)).toBe("2026-07-13");
  });

  it("entiende 'pasado manana' sin tilde", () => {
    expect(parseNaturalDate("pasado manana", TZ, NOW)).toBe("2026-07-13");
  });

  it("entiende un día de semana sin tilde ('miercoles')", () => {
    // 11/07/2026 es sábado. El próximo miércoles es el 15/07.
    expect(parseNaturalDate("el miercoles", TZ, NOW)).toBe("2026-07-15");
  });

  it("entiende un día de semana con tilde ('sábado') como próxima ocurrencia (hoy incluido)", () => {
    expect(parseNaturalDate("el sábado", TZ, NOW)).toBe("2026-07-11");
  });

  it("entiende 'el lunes'", () => {
    expect(parseNaturalDate("puedo el lunes que viene?", TZ, NOW)).toBe("2026-07-13");
  });

  it("entiende dd/mm", () => {
    expect(parseNaturalDate("15/7", TZ, NOW)).toBe("2026-07-15");
  });

  it("entiende dd-mm", () => {
    expect(parseNaturalDate("15-07", TZ, NOW)).toBe("2026-07-15");
  });

  it("entiende dd/mm/aaaa", () => {
    expect(parseNaturalDate("15/07/2026", TZ, NOW)).toBe("2026-07-15");
  });

  it("entiende el formato legacy AAAA-MM-DD", () => {
    expect(parseNaturalDate("2026-07-20", TZ, NOW)).toBe("2026-07-20");
  });

  it("si la fecha dd/mm sin año ya pasó este año, asume el año próximo", () => {
    expect(parseNaturalDate("1/1", TZ, NOW)).toBe("2027-01-01");
  });

  it("devuelve null si no reconoce ninguna fecha", () => {
    expect(parseNaturalDate("quiero llevar a mi gato", TZ, NOW)).toBeNull();
  });
});

describe("parseNaturalTime", () => {
  it("entiende HH:MM", () => expect(parseNaturalTime("16:00")).toBe("16:00"));
  it("entiende HH.MM", () => expect(parseNaturalTime("16.30")).toBe("16:30"));
  it("entiende '16hs'", () => expect(parseNaturalTime("16hs")).toBe("16:00"));
  it("entiende '16 hs'", () => expect(parseNaturalTime("16 hs")).toBe("16:00"));
  it("entiende un número suelo como hora completa", () => expect(parseNaturalTime("16")).toBe("16:00"));
  it("entiende '4 de la tarde'", () => expect(parseNaturalTime("4 de la tarde")).toBe("16:00"));
  it("entiende '9 de la mañana'", () => expect(parseNaturalTime("9 de la manana")).toBe("09:00"));
  it("no confunde un número dentro de una frase más larga", () => expect(parseNaturalTime("quiero 2 turnos para el lunes")).toBeNull());
});

describe("describeDate", () => {
  it("describe hoy", () => expect(describeDate("2026-07-11", TZ, NOW)).toBe("hoy sábado 11/07"));
  it("describe mañana", () => expect(describeDate("2026-07-12", TZ, NOW)).toBe("mañana domingo 12/07"));
  it("describe pasado mañana", () => expect(describeDate("2026-07-13", TZ, NOW)).toBe("pasado mañana lunes 13/07"));
  it("describe una fecha más lejana con 'el'", () => expect(describeDate("2026-07-15", TZ, NOW)).toBe("el miércoles 15/07"));
});

describe("weekdayLabel", () => {
  it("devuelve el nombre del día con tilde", () => expect(weekdayLabel("2026-07-15", TZ)).toBe("miércoles"));
});

describe("joinTimes", () => {
  it("une un solo horario", () => expect(joinTimes(["09:00"])).toBe("09:00"));
  it("une dos horarios con 'y'", () => expect(joinTimes(["09:00", "10:00"])).toBe("09:00 y 10:00"));
  it("usa 'u' antes de las 11", () => expect(joinTimes(["09:00", "10:00", "11:00"])).toBe("09:00, 10:00 u 11:00"));
  it("usa 'u' antes de las 8", () => expect(joinTimes(["07:00", "08:00"])).toBe("07:00 u 08:00"));
});
