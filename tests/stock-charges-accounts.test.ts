import { beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { createProduct, createSale, getCashDay, voidSale } from "../src/lib/services/sales";
import { adjustStock, getProductStock, listExpiringLots, registerPurchase } from "../src/lib/services/stock";
import { createMedicalRecord } from "../src/lib/services/medical-records";
import { listPendingCharges, waivePendingCharges } from "../src/lib/services/pending-charges";
import { getBalances, getClientAccount, listDebtors, registerClientPayment } from "../src/lib/services/client-accounts";
import { createTestClient, createTestClinic, createTestPet, createTestVet, prisma, resetDatabase } from "./setup/db";

const TZ = "America/Argentina/Buenos_Aires";
const inDays = (days: number) => DateTime.now().setZone(TZ).plus({ days }).toISODate()!;

async function setup() {
  const clinic = await createTestClinic();
  const vet = await createTestVet(clinic.id);
  const client = await createTestClient(clinic.id);
  const pet = await createTestPet(clinic.id, client.id);
  const vaccine = await createProduct(clinic.id, { name: "Vacuna séxtuple", kind: "PRODUCT", price: 20000, trackStock: true, minStock: 2 });
  return { clinic, vet, client, pet, vaccine };
}

const stockOf = async (productId: string) => (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

describe("stock: compras, lotes y ajustes", () => {
  beforeEach(resetDatabase);

  it("el ingreso suma stock, guarda lote y costo; las salidas consumen primero el lote que vence antes", async () => {
    const { clinic, vet, vaccine } = await setup();
    await registerPurchase({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, quantity: 5, unitCost: 12000, supplier: "Droguería Sur", lotNumber: "B-200", expiresOn: inDays(200), timezone: TZ });
    await registerPurchase({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, quantity: 3, unitCost: 12500, lotNumber: "A-100", expiresOn: inDays(20), timezone: TZ });
    expect(await stockOf(vaccine.id)).toBe(8);

    await createSale({ clinicId: clinic.id, userId: vet.id, paymentMethod: "CASH", items: [{ productId: vaccine.id, quantity: 4 }] });
    const detail = (await getProductStock(clinic.id, vaccine.id))!;
    expect(detail.product.cost).toBe(12500);
    // Se vació A-100 (vence en 20 días) y salió 1 de B-200.
    expect(detail.lots.map((lot) => [lot.lotNumber, lot.quantity])).toEqual([["B-200", 4]]);
    expect(detail.movements.filter((row) => row.type === "SALE").map((row) => row.quantity).sort((a, b) => a - b)).toEqual([-3, -1]);
  });

  it("anular una venta devuelve las unidades a los mismos lotes", async () => {
    const { clinic, vet, vaccine } = await setup();
    await registerPurchase({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, quantity: 2, lotNumber: "A", expiresOn: inDays(10), timezone: TZ });
    await registerPurchase({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, quantity: 2, lotNumber: "B", expiresOn: inDays(90), timezone: TZ });
    const sale = await createSale({ clinicId: clinic.id, userId: vet.id, paymentMethod: "CASH", items: [{ productId: vaccine.id, quantity: 3 }] });
    await voidSale(clinic.id, sale.id, vet.id);
    const detail = (await getProductStock(clinic.id, vaccine.id))!;
    expect(detail.product.stock).toBe(4);
    expect(detail.lots.map((lot) => [lot.lotNumber, lot.quantity])).toEqual([["A", 2], ["B", 2]]);
  });

  it("avisa lotes vencidos o por vencer y el ajuste deja rastro con motivo", async () => {
    const { clinic, vet, vaccine } = await setup();
    await registerPurchase({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, quantity: 2, lotNumber: "VIEJO", expiresOn: inDays(-3), timezone: TZ });
    await registerPurchase({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, quantity: 2, lotNumber: "PRONTO", expiresOn: inDays(15), timezone: TZ });
    await registerPurchase({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, quantity: 2, lotNumber: "LEJOS", expiresOn: inDays(300), timezone: TZ });
    const expiring = await listExpiringLots(clinic.id);
    expect(expiring.map((lot) => [lot.lotNumber, lot.expired])).toEqual([["VIEJO", true], ["PRONTO", false]]);

    await adjustStock({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, newStock: 4, note: "Vencidas descartadas" });
    expect(await stockOf(vaccine.id)).toBe(4);
    expect((await listExpiringLots(clinic.id)).map((lot) => lot.lotNumber)).toEqual(["PRONTO"]);
    const adjustment = (await getProductStock(clinic.id, vaccine.id))!.movements.find((row) => row.type === "ADJUSTMENT");
    expect(adjustment).toMatchObject({ quantity: -2, note: "Vencidas descartadas" });
  });
});

describe("uso en consulta y pendientes de cobro", () => {
  beforeEach(resetDatabase);

  it("registrar una vacuna descuenta stock y la deja pendiente; cobrarla no la descuenta dos veces", async () => {
    const { clinic, vet, pet, vaccine } = await setup();
    await registerPurchase({ clinicId: clinic.id, userId: vet.id, productId: vaccine.id, quantity: 5, timezone: TZ });
    await createMedicalRecord({ clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "VACCINE", reason: "Séxtuple", usedProducts: [{ productId: vaccine.id, quantity: 1 }] });
    expect(await stockOf(vaccine.id)).toBe(4);

    const [pending] = await listPendingCharges(clinic.id);
    expect(pending).toMatchObject({ petId: pet.id, usagesTotal: 20000 });
    expect(pending.usages).toHaveLength(1);

    const sale = await createSale({ clinicId: clinic.id, userId: vet.id, petId: pet.id, paymentMethod: "CASH", items: [{ usageMovementIds: pending.usages[0].movementIds }] });
    expect(Number(sale.total)).toBe(20000);
    expect(await stockOf(vaccine.id)).toBe(4);
    expect(await listPendingCharges(clinic.id)).toEqual([]);

    // Anular devuelve el pendiente (el producto igual se aplicó) sin devolver stock.
    await voidSale(clinic.id, sale.id, vet.id);
    expect(await stockOf(vaccine.id)).toBe(4);
    expect(await listPendingCharges(clinic.id)).toHaveLength(1);
  });

  it("si no hay stock, la atención no se guarda", async () => {
    const { clinic, vet, pet, vaccine } = await setup();
    await expect(
      createMedicalRecord({ clinicId: clinic.id, petId: pet.id, userId: vet.id, type: "VACCINE", reason: "Séxtuple", usedProducts: [{ productId: vaccine.id, quantity: 1 }] })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await prisma.medicalRecord.count()).toBe(0);
  });

  it("los turnos atendidos sin cobrar aparecen, se cierran al cobrar y se pueden descartar", async () => {
    const { clinic, vet, pet, client } = await setup();
    const attended = (daysAgo: number) => {
      const startAt = DateTime.now().minus({ days: daysAgo }).toJSDate();
      return prisma.appointment.create({ data: { clinicId: clinic.id, petId: pet.id, veterinarianId: vet.id, reason: "Control", startAt, endAt: new Date(startAt.getTime() + 1_800_000), status: "ATTENDED" } });
    };
    const recent = await attended(1);
    await attended(45); // fuera de la ventana de 30 días
    const [pending] = await listPendingCharges(clinic.id);
    expect(pending.appointments.map((row) => row.id)).toEqual([recent.id]);

    await createSale({ clinicId: clinic.id, userId: vet.id, petId: pet.id, paymentMethod: "DEBIT", items: [{ description: "Consulta", unitPrice: 15000, quantity: 1 }], appointmentIds: [recent.id] });
    expect(await listPendingCharges(clinic.id)).toEqual([]);

    const other = await createTestPet(clinic.id, client.id, { name: "Otra" });
    const startAt = DateTime.now().minus({ days: 2 }).toJSDate();
    await prisma.appointment.create({ data: { clinicId: clinic.id, petId: other.id, veterinarianId: vet.id, reason: "Control", startAt, endAt: startAt, status: "ATTENDED" } });
    expect(await waivePendingCharges(clinic.id, other.id)).toBe(1);
    expect(await listPendingCharges(clinic.id)).toEqual([]);
  });
});

describe("cuenta corriente", () => {
  beforeEach(resetDatabase);

  it("las ventas a cuenta suman deuda, los pagos la bajan y la caja cuenta solo lo cobrado", async () => {
    const { clinic, vet, pet, client } = await setup();
    await expect(createSale({ clinicId: clinic.id, userId: vet.id, paymentMethod: "ACCOUNT", items: [{ description: "Baño", unitPrice: 1000, quantity: 1 }] })).rejects.toMatchObject({ code: "ACCOUNT_NEEDS_CLIENT" });

    await createSale({ clinicId: clinic.id, userId: vet.id, petId: pet.id, paymentMethod: "ACCOUNT", items: [{ description: "Cirugía", unitPrice: 80000, quantity: 1 }] });
    const voided = await createSale({ clinicId: clinic.id, userId: vet.id, petId: pet.id, paymentMethod: "ACCOUNT", items: [{ description: "Error", unitPrice: 5000, quantity: 1 }] });
    await voidSale(clinic.id, voided.id, vet.id);
    await registerClientPayment({ clinicId: clinic.id, userId: vet.id, clientId: client.id, amount: 30000, paymentMethod: "CASH" });
    await expect(registerClientPayment({ clinicId: clinic.id, userId: vet.id, clientId: client.id, amount: 1, paymentMethod: "ACCOUNT" })).rejects.toMatchObject({ code: "INVALID_METHOD" });

    expect((await getBalances(clinic.id)).get(client.id)).toBe(50000);
    expect(await listDebtors(clinic.id)).toEqual([expect.objectContaining({ id: client.id, balance: 50000 })]);
    const account = (await getClientAccount(clinic.id, client.id))!;
    expect(account.entries.map((row) => row.kind)).toEqual(["payment", "sale", "sale"]);

    const cash = await getCashDay(clinic.id, TZ, inDays(0));
    expect(cash).toMatchObject({ salesTotal: 80000, paymentsTotal: 30000, cashInDrawer: 30000 });
    expect(cash.byMethod).toEqual([{ method: "ACCOUNT", total: 80000 }]);

    const otherClinic = await createTestClinic({ name: "Otra" });
    expect(await getClientAccount(otherClinic.id, client.id)).toBeNull();
  });
});
