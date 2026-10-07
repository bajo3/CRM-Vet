import type { PaymentMethod, ProductKind } from "@prisma/client";
import { DateTime } from "luxon";
import { getPrisma } from "../prisma";

export class SaleError extends Error {
  constructor(
    public readonly code: "EMPTY" | "PRODUCT_NOT_FOUND" | "INSUFFICIENT_STOCK" | "CLIENT_NOT_FOUND" | "PET_NOT_FOUND" | "SALE_NOT_FOUND",
    /** Nombre del producto involucrado, para mostrar un mensaje concreto. */
    public readonly detail?: string
  ) {
    super(code);
  }
}

/** Trabaja en centavos enteros para que sumar precios no arrastre errores de coma flotante. */
function toCents(value: number): number {
  return Math.round(value * 100);
}

export type SaleItemInput = { productId: string; quantity: number } | { description: string; unitPrice: number; quantity: number };

export type CreateSaleInput = {
  clinicId: string;
  userId: string;
  clientId?: string | null;
  petId?: string | null;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  items: SaleItemInput[];
};

/**
 * Registra una venta cobrada. El precio de los ítems del catálogo y el total se resuelven siempre acá
 * (nunca se confía en lo que manda el formulario). Los productos con control de stock se descuentan
 * de forma atómica dentro de la misma transacción: si no alcanza, no se cobra nada.
 */
export async function createSale(input: CreateSaleInput) {
  if (input.items.length === 0) throw new SaleError("EMPTY");
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    let clientId = input.clientId ?? null;
    if (input.petId) {
      const pet = await tx.pet.findFirst({ where: { id: input.petId, clinicId: input.clinicId }, select: { clientId: true } });
      if (!pet) throw new SaleError("PET_NOT_FOUND");
      clientId = pet.clientId;
    } else if (clientId) {
      const client = await tx.client.findFirst({ where: { id: clientId, clinicId: input.clinicId }, select: { id: true } });
      if (!client) throw new SaleError("CLIENT_NOT_FOUND");
    }

    const lines: { productId: string | null; description: string; quantity: number; unitCents: number }[] = [];
    for (const item of input.items) {
      if ("productId" in item && item.productId) {
        const product = await tx.product.findFirst({ where: { id: item.productId, clinicId: input.clinicId, active: true } });
        if (!product) throw new SaleError("PRODUCT_NOT_FOUND");
        if (product.trackStock) {
          // `updateMany` condicionado: si dos ventas compiten por la última unidad, solo una descuenta.
          const updated = await tx.product.updateMany({
            where: { id: product.id, clinicId: input.clinicId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (updated.count === 0) throw new SaleError("INSUFFICIENT_STOCK", product.name);
        }
        lines.push({ productId: product.id, description: product.name, quantity: item.quantity, unitCents: toCents(Number(product.price)) });
      } else if ("description" in item) {
        lines.push({ productId: null, description: item.description, quantity: item.quantity, unitCents: toCents(item.unitPrice) });
      }
    }

    const totalCents = lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
    return tx.sale.create({
      data: {
        clinicId: input.clinicId,
        userId: input.userId,
        clientId,
        petId: input.petId ?? null,
        paymentMethod: input.paymentMethod,
        notes: input.notes || null,
        total: totalCents / 100,
        items: {
          create: lines.map((line) => ({
            clinicId: input.clinicId,
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitCents / 100,
            subtotal: (line.unitCents * line.quantity) / 100,
          })),
        },
      },
      include: { items: true },
    });
  });
}

/** Anula una venta: devuelve el stock descontado y la saca de los totales. Anular dos veces no hace nada. */
export async function voidSale(clinicId: string, saleId: string, userId: string) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, clinicId }, include: { items: { include: { product: true } } } });
    if (!sale) throw new SaleError("SALE_NOT_FOUND");
    // El cambio de estado condicionado evita devolver el stock dos veces ante dos anulaciones simultáneas.
    const changed = await tx.sale.updateMany({
      where: { id: sale.id, clinicId, status: "COMPLETED" },
      data: { status: "VOIDED", voidedAt: new Date(), voidedById: userId },
    });
    if (changed.count === 0) return sale;

    for (const item of sale.items) {
      if (item.productId && item.product?.trackStock) {
        await tx.product.updateMany({ where: { id: item.productId, clinicId }, data: { stock: { increment: item.quantity } } });
      }
    }
    return sale;
  });
}

export type ProductInput = { name: string; kind: ProductKind; price: number; trackStock: boolean; stock: number; minStock: number };

function productData(input: ProductInput) {
  // Un servicio no tiene existencias: se ignora cualquier valor de stock que llegue.
  const trackStock = input.kind === "PRODUCT" && input.trackStock;
  return {
    name: input.name,
    kind: input.kind,
    price: input.price,
    trackStock,
    stock: trackStock ? input.stock : 0,
    minStock: trackStock ? input.minStock : 0,
  };
}

export async function createProduct(clinicId: string, input: ProductInput) {
  return getPrisma().product.create({ data: { clinicId, ...productData(input) } });
}

/** Actualiza un producto de la clínica. Devuelve `false` si no existe o es de otra clínica. */
export async function updateProduct(clinicId: string, productId: string, input: ProductInput): Promise<boolean> {
  const result = await getPrisma().product.updateMany({ where: { id: productId, clinicId }, data: productData(input) });
  return result.count > 0;
}

/** Da de baja (o reactiva) un producto sin borrarlo, para no perder el detalle de las ventas pasadas. */
export async function setProductActive(clinicId: string, productId: string, active: boolean): Promise<boolean> {
  const result = await getPrisma().product.updateMany({ where: { id: productId, clinicId }, data: { active } });
  return result.count > 0;
}

export async function createCashMovement(input: { clinicId: string; userId: string; type: "IN" | "OUT"; amount: number; description: string }) {
  return getPrisma().cashMovement.create({
    data: { clinicId: input.clinicId, userId: input.userId, type: input.type, amount: toCents(input.amount) / 100, description: input.description },
  });
}

/**
 * Caja de un día (en la zona horaria de la clínica): ventas cobradas por medio de pago, movimientos
 * manuales y el efectivo que debería haber en el cajón (ventas en efectivo + ingresos − egresos).
 */
export async function getCashDay(clinicId: string, timezone: string, date: string) {
  const prisma = getPrisma();
  const day = DateTime.fromISO(date, { zone: timezone });
  const range = { gte: day.startOf("day").toUTC().toJSDate(), lte: day.endOf("day").toUTC().toJSDate() };

  const [sales, movements] = await Promise.all([
    prisma.sale.findMany({
      where: { clinicId, createdAt: range },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        total: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
        notes: true,
        client: { select: { name: true } },
        pet: { select: { name: true } },
        user: { select: { name: true } },
        items: { select: { id: true, description: true, quantity: true, subtotal: true } },
      },
    }),
    prisma.cashMovement.findMany({
      where: { clinicId, createdAt: range },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, amount: true, description: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);

  const byMethod = new Map<PaymentMethod, number>();
  let salesCents = 0;
  for (const sale of sales) {
    if (sale.status !== "COMPLETED") continue;
    const cents = toCents(Number(sale.total));
    salesCents += cents;
    byMethod.set(sale.paymentMethod, (byMethod.get(sale.paymentMethod) ?? 0) + cents);
  }
  const movementCents = (type: "IN" | "OUT") => movements.filter((row) => row.type === type).reduce((sum, row) => sum + toCents(Number(row.amount)), 0);
  const cashIn = movementCents("IN");
  const cashOut = movementCents("OUT");

  return {
    sales: sales.map((sale) => ({ ...sale, total: Number(sale.total), items: sale.items.map((item) => ({ ...item, subtotal: Number(item.subtotal) })) })),
    movements: movements.map((row) => ({ ...row, amount: Number(row.amount) })),
    salesTotal: salesCents / 100,
    salesCount: sales.filter((sale) => sale.status === "COMPLETED").length,
    byMethod: [...byMethod.entries()].map(([method, cents]) => ({ method, total: cents / 100 })).sort((a, b) => b.total - a.total),
    cashIn: cashIn / 100,
    cashOut: cashOut / 100,
    cashInDrawer: ((byMethod.get("CASH") ?? 0) + cashIn - cashOut) / 100,
  };
}

export type CashDay = Awaited<ReturnType<typeof getCashDay>>;

/** Catálogo de la clínica. `onlyActive` para el formulario de venta; todo para la administración. */
export async function listProducts(clinicId: string, onlyActive = false) {
  const products = await getPrisma().product.findMany({
    where: { clinicId, ...(onlyActive ? { active: true } : {}) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    kind: product.kind,
    price: Number(product.price),
    trackStock: product.trackStock,
    stock: product.stock,
    minStock: product.minStock,
    active: product.active,
    lowStock: product.trackStock && product.stock <= product.minStock,
  }));
}

export type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];
