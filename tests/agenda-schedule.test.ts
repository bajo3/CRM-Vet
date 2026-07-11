import { describe, expect, it } from "vitest";
import { getWeekStart, getWeekDates, shiftDate, mergeSlotTimes } from "../src/lib/services/agenda-schedule";

const TZ = "America/Argentina/Buenos_Aires";

describe("agenda-schedule: helpers de rango semanal", () => {
  it("getWeekStart devuelve el lunes de la semana para un día de mitad de semana", () => {
    // 2026-07-10 es viernes
    expect(getWeekStart("2026-07-10", TZ)).toBe("2026-07-06");
  });

  it("getWeekStart devuelve la misma fecha si ya es lunes", () => {
    expect(getWeekStart("2026-07-06", TZ)).toBe("2026-07-06");
  });

  it("getWeekStart de un domingo devuelve el lunes anterior (semana lunes-domingo)", () => {
    expect(getWeekStart("2026-07-12", TZ)).toBe("2026-07-06");
  });

  it("getWeekDates devuelve las 7 fechas de lunes a domingo", () => {
    const dates = getWeekDates("2026-07-06", TZ);
    expect(dates).toEqual(["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"]);
  });

  it("shiftDate suma y resta días respetando la zona horaria", () => {
    expect(shiftDate("2026-07-10", 1, TZ)).toBe("2026-07-11");
    expect(shiftDate("2026-07-10", -1, TZ)).toBe("2026-07-09");
    expect(shiftDate("2026-07-10", 7, TZ)).toBe("2026-07-17");
  });

  it("mergeSlotTimes combina y ordena horarios teóricos con horarios reales, sin duplicar", () => {
    const merged = mergeSlotTimes(["09:00", "09:30", "10:00"], ["09:15", "09:30"]);
    expect(merged).toEqual(["09:00", "09:15", "09:30", "10:00"]);
  });
});
