import { beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { createCashMovement, createProduct, createSale, getCashDay, listProducts, SaleError, setProductActive, voidSale } from "../src/lib/services/sales";
import { createTestClient, createTestClinic, createTestPet, createTestVet, prisma, resetDatabase } from "./setup/db";

const TZ = "America/Argentina/Buenos_Aires";
const today = () => DateTime.now().setZone(TZ).toISODate()!;

async function setup() {
  const clinic = await createTestClinic();
  const user = await createTestVet(clinic.id);
  const food = await createProduct(clinic.id, { name: "Alimento 3 kg", kind: "PRODUCT", price: 12500.5, trackStock: true, stock: 5, minStock: 2 });
  const consult = await createProduct(clinic.id, { name: "Consulta", kind: "SERVICE", price: 18000, trackStock: true, stock: 9, minStock: 9 });
  return { clinic, user, food, consult };
}

describe("ventas, stock y caja", () => {
  beforeEach(resetDatabase);

  it("calcula el total con los precios del catálogo y descuenta solo el stock controlado", async () => {
    const { clinic, user, food, consult } = await setup();
    const client = await createTestClient(clinic.id);
    const pet = await createTestPet(clinic.id, client.id);

    const sale = await createSale({
      clinicId: clinic.id,
      userId: user.id,
      petId: pet.id,
      paymentMethod: "CASH",
      items: [
        { productId: food.id, quantity: 2 },
        { productId: consult.id, quantity: 1 },
        { description: "Corte de uñas", unitPrice: 3000.1, quantity: 3 },
      ],
    });

    // 2 × 12500,50 + 18000 + 3 × 3000,10 = 52001,30 (sin errores de coma flotante)
    expect(Number(sale.total)).toBe(52001.3);
    expect(sale.clientId).toBe(client.id);
    expect(sale.items.map((item) => item.description)).toEqual(["Alimento 3 kg", "Consulta", "Corte de uñas"]);

    const products = await listProducts(clinic.id);
    expect(products.find((row) => row.id === food.id)).toMatchObject({ stock: 3, lowStock: false });
    // Un servicio nunca controla stock, aunque el formulario lo haya mandado activado.
    expect(products.find((row) => row.id === consult.id)).toMatchObject({ trackStock: false, stock: 0, lowStock: false });
  });

  it("rechaza la venta completa si no alcanza el stock, sin descontar nada", async () => {
    const { clinic, user, food } = await setup();
    await expect(
      createSale({ clinicId: clinic.id, userId: user.id, paymentMethod: "DEBIT", items: [{ description: "Baño", unitPrice: 100, quantity: 1 }, { productId: food.id, quantity: 6 }] })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", detail: "Alimento 3 kg" });
    expect(await prisma.sale.count()).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: food.id } })).stock).toBe(5);
  });

  it("no vende productos de otra clínica ni dados de baja", async () => {
    const { clinic, user, food } = await setup();
    const other = await createTestClinic({ name: "Otra" });
    const otherUser = await createTestVet(other.id);
    await expect(createSale({ clinicId: other.id, userId: otherUser.id, paymentMethod: "CASH", items: [{ productId: food.id, quantity: 1 }] })).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });

    expect(await setProductActive(other.id, food.id, false)).toBe(false);
    expect(await setProductActive(clinic.id, food.id, false)).toBe(true);
    await expect(createSale({ clinicId: clinic.id, userId: user.id, paymentMethod: "CASH", items: [{ productId: food.id, quantity: 1 }] })).rejects.toBeInstanceOf(SaleError);
  });

  it("anular devuelve el stock una sola vez y saca la venta de la caja", async () => {
    const { clinic, user, food } = await setup();
    const sale = await createSale({ clinicId: clinic.id, userId: user.id, paymentMethod: "CASH", items: [{ productId: food.id, quantity: 4 }] });
    expect((await listProducts(clinic.id)).find((row) => row.id === food.id)).toMatchObject({ stock: 1, lowStock: true });

    await voidSale(clinic.id, sale.id, user.id);
    await voidSale(clinic.id, sale.id, user.id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: food.id } })).stock).toBe(5);

    const cash = await getCashDay(clinic.id, TZ, today());
    expect(cash).toMatchObject({ salesTotal: 0, salesCount: 0, cashInDrawer: 0 });
    expect(cash.sales).toHaveLength(1);
    await expect(voidSale((await createTestClinic()).id, sale.id, user.id)).rejects.toMatchObject({ code: "SALE_NOT_FOUND" });
  });

  it("la caja del día separa medios de pago y suma movimientos manuales al efectivo", async () => {
    const { clinic, user, consult } = await setup();
    await createSale({ clinicId: clinic.id, userId: user.id, paymentMethod: "CASH", items: [{ productId: consult.id, quantity: 1 }] });
    await createSale({ clinicId: clinic.id, userId: user.id, paymentMethod: "TRANSFER", items: [{ productId: consult.id, quantity: 2 }] });
    await createCashMovement({ clinicId: clinic.id, userId: user.id, type: "IN", amount: 5000, description: "Cambio inicial" });
    await createCashMovement({ clinicId: clinic.id, userId: user.id, type: "OUT", amount: 2500.5, description: "Pago a proveedor" });

    const cash = await getCashDay(clinic.id, TZ, today());
    expect(cash).toMatchObject({ salesTotal: 54000, salesCount: 2, cashIn: 5000, cashOut: 2500.5, cashInDrawer: 20499.5 });
    expect(cash.byMethod).toEqual([{ method: "TRANSFER", total: 36000 }, { method: "CASH", total: 18000 }]);

    const yesterday = DateTime.now().setZone(TZ).minus({ days: 1 }).toISODate()!;
    expect(await getCashDay(clinic.id, TZ, yesterday)).toMatchObject({ salesTotal: 0, cashInDrawer: 0 });
  });
});
