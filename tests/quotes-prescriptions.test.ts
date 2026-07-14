import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQuote, getQuoteForClinic } from "../src/lib/services/quotes";
import { createPrescription, getPrescriptionForClinic } from "../src/lib/services/prescriptions";
import { createTestClient, createTestClinic, createTestPet, createTestVet, resetDatabase } from "./setup/db";

async function setupClinic() {
  const clinic = await createTestClinic();
  const vet = await createTestVet(clinic.id, "Dra. Test");
  const client = await createTestClient(clinic.id);
  const pet = await createTestPet(clinic.id, client.id, { name: "Firulais" });
  return { clinic, vet, client, pet };
}

describe("quotes: presupuestos", () => {
  beforeEach(resetDatabase);

  it("calcula el total sumando los items, ignorando cualquier total que intente mandar el llamador", async () => {
    const { clinic, vet, pet } = await setupClinic();

    const quote = await createQuote({
      clinicId: clinic.id,
      petId: pet.id,
      userId: vet.id,
      items: [
        { description: "Consulta", amount: 5000 },
        { description: "Vacuna", amount: 3500.5 },
      ],
      // @ts-expect-error el tipo no admite `total`, pero probamos que aunque se cuele no se use
      total: 1,
    });

    expect(Number(quote.total)).toBeCloseTo(8500.5, 2);
  });

  it("rechaza una lista de items vacía", async () => {
    const { clinic, vet, pet } = await setupClinic();
    await expect(createQuote({ clinicId: clinic.id, petId: pet.id, userId: vet.id, items: [] })).rejects.toThrow();
  });

  it("rechaza un monto negativo o cero en un item", async () => {
    const { clinic, vet, pet } = await setupClinic();
    await expect(
      createQuote({ clinicId: clinic.id, petId: pet.id, userId: vet.id, items: [{ description: "Consulta", amount: 0 }] })
    ).rejects.toThrow();
  });

  it("no permite crear un presupuesto para una mascota de otra clínica (aislamiento multiempresa)", async () => {
    const { pet } = await setupClinic();
    const otherClinic = await createTestClinic({ name: "Otra clínica" });
    const otherVet = await createTestVet(otherClinic.id, "Dr. Otro");

    await expect(
      createQuote({ clinicId: otherClinic.id, petId: pet.id, userId: otherVet.id, items: [{ description: "Consulta", amount: 100 }] })
    ).rejects.toThrow("PET_NOT_FOUND");
  });

  it("no permite leer un presupuesto de otra clínica", async () => {
    const { clinic, vet, pet } = await setupClinic();
    const quote = await createQuote({ clinicId: clinic.id, petId: pet.id, userId: vet.id, items: [{ description: "Consulta", amount: 100 }] });

    const otherClinic = await createTestClinic({ name: "Otra clínica" });
    const found = await getQuoteForClinic(otherClinic.id, quote.id);
    expect(found).toBeNull();

    const foundSameClinic = await getQuoteForClinic(clinic.id, quote.id);
    expect(foundSameClinic?.id).toBe(quote.id);
  });
});

describe("prescriptions: recetas", () => {
  beforeEach(resetDatabase);

  it("crea una receta con contenido no vacío", async () => {
    const { clinic, vet, pet } = await setupClinic();
    const prescription = await createPrescription({
      clinicId: clinic.id,
      petId: pet.id,
      userId: vet.id,
      content: "Meloxicam 0,2mg/kg cada 24hs por 5 días, vía oral.",
    });
    expect(prescription.content).toContain("Meloxicam");
  });

  it("rechaza contenido vacío (o solo espacios)", async () => {
    const { clinic, vet, pet } = await setupClinic();
    await expect(createPrescription({ clinicId: clinic.id, petId: pet.id, userId: vet.id, content: "   " })).rejects.toThrow("EMPTY_CONTENT");
  });

  it("no permite crear una receta para una mascota de otra clínica (aislamiento multiempresa)", async () => {
    const { pet } = await setupClinic();
    const otherClinic = await createTestClinic({ name: "Otra clínica" });
    const otherVet = await createTestVet(otherClinic.id, "Dr. Otro");

    await expect(
      createPrescription({ clinicId: otherClinic.id, petId: pet.id, userId: otherVet.id, content: "Indicación de prueba." })
    ).rejects.toThrow("PET_NOT_FOUND");
  });

  it("no permite leer una receta de otra clínica", async () => {
    const { clinic, vet, pet } = await setupClinic();
    const prescription = await createPrescription({ clinicId: clinic.id, petId: pet.id, userId: vet.id, content: "Indicación de prueba." });

    const otherClinic = await createTestClinic({ name: "Otra clínica" });
    const found = await getPrescriptionForClinic(otherClinic.id, prescription.id);
    expect(found).toBeNull();

    const foundSameClinic = await getPrescriptionForClinic(clinic.id, prescription.id);
    expect(foundSameClinic?.id).toBe(prescription.id);
  });
});

describe("permisos: server actions de presupuestos y recetas", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function mockSession(role: "OWNER" | "ADMIN" | "VETERINARIAN" | "RECEPTIONIST", overrides: { userId: string; clinicId: string }) {
    // `revalidatePath` exige un store de generación estática que solo existe dentro de un request
    // real de Next.js; en este test unitario de la server action se lo reemplaza por un no-op.
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("../src/lib/auth/session", async () => {
      const actual = await vi.importActual<typeof import("../src/lib/auth/session")>("../src/lib/auth/session");
      return {
        ...actual,
        getSession: vi.fn().mockResolvedValue({ userId: overrides.userId, clinicId: overrides.clinicId, role, name: "Test" }),
      };
    });
  }

  it("RECEPTIONIST puede crear un presupuesto", async () => {
    await resetDatabase();
    const { clinic, pet } = await setupClinic();
    const receptionist = await createTestVet(clinic.id, "Recepción Test");

    await mockSession("RECEPTIONIST", { userId: receptionist.id, clinicId: clinic.id });
    const { createQuoteAction } = await import("../src/lib/actions/quotes");

    const result = await createQuoteAction(pet.id, { items: [{ description: "Consulta", amount: 100 }], title: undefined, notes: undefined });
    expect(result.ok).toBe(true);
  });

  it("RECEPTIONIST NO puede crear una receta (la server action la rechaza)", async () => {
    await resetDatabase();
    const { clinic, pet } = await setupClinic();
    const receptionist = await createTestVet(clinic.id, "Recepción Test");

    await mockSession("RECEPTIONIST", { userId: receptionist.id, clinicId: clinic.id });
    const { createPrescriptionAction } = await import("../src/lib/actions/prescriptions");

    const result = await createPrescriptionAction(pet.id, { content: "Indicación de prueba suficientemente larga." });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/no tenés permisos/i);
    }
  });

  it("VETERINARIAN sí puede crear una receta", async () => {
    await resetDatabase();
    const { clinic, vet, pet } = await setupClinic();

    await mockSession("VETERINARIAN", { userId: vet.id, clinicId: clinic.id });
    const { createPrescriptionAction } = await import("../src/lib/actions/prescriptions");

    const result = await createPrescriptionAction(pet.id, { content: "Indicación de prueba suficientemente larga." });
    expect(result.ok).toBe(true);
  });
});
