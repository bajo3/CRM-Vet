import type { PaymentMethod, ProductKind } from "@prisma/client";
import { DateTime } from "luxon";
import { getPrisma } from "../prisma";
import { returnStock, StockError, takeStock } from "./stock";

export class SaleError extends Error {
  constructor(
    public readonly code:
      | "EMPTY"
      | "PRODUCT_NOT_FOUND"
      | "INSUFFICIENT_STOCK"
      | "CLIENT_NOT_FOUND"
      | "PET_NOT_FOUND"
      | "SALE_NOT_FOUND"
      | "ACCOUNT_NEEDS_CLIENT"
      | "USAGE_NOT_FOUND"
      | "APPOINTMENT_NOT_FOUND",
    /** Nombre del producto involucrado, para mostrar un mensaje concreto. */
    public readonly detail?: string
  ) {
    super(code);
  }
}

/** Trabaja en centavos enteros para que sumar precios no arrastre errores de coma flotante. */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

export type SaleItemInput =
  | { productId: string; quantity: number }
  | { description: string; unitPrice: number; quantity: number }
  /** Productos ya usados en una consulta (pendientes de cobro): no se vuelven a descontar del stock. */
  | { usageMovementIds: string[] };

export type CreateSaleInput = {
  clinicId: string;
  userId: string;
  clientId?: string | null;
  petId?: string | null;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  items: SaleItemInput[];
  /** Turnos atendidos que quedan cobrados con esta venta. */
  appointmentIds?: string[];
};

type Line = { productId: string | null; description: string; quantity: number; unitCents: number; stockDeducted: boolean; usageIds?: string[] };

/**
 * Registra una venta cobrada. El precio de los ítems del catálogo y el total se resuelven siempre acá
 * (nunca se confía en lo que manda el formulario). Los productos con control de stock se descuentan
 * en la misma transacción, consumiendo lotes por vencimiento: si no alcanza, no se cobra nada.
 */
export async function createSale(input: CreateSaleInput) {
  if (input.items.length === 0 && !input.appointmentIds?.length) throw new SaleError("EMPTY");
  const prisma = getPrisma();

  try {
    return await prisma.$transaction(async (tx) => {
      let clientId = input.clientId ?? null;
      if (input.petId) {
        const pet = await tx.pet.findFirst({ where: { id: input.petId, clinicId: input.clinicId }, select: { clientId: true } });
        if (!pet) throw new SaleError("PET_NOT_FOUND");
        clientId = pet.clientId;
      } else if (clientId) {
        const client = await tx.client.findFirst({ where: { id: clientId, clinicId: input.clinicId }, select: { id: true } });
        if (!client) throw new SaleError("CLIENT_NOT_FOUND");
      }
      if (input.paymentMethod === "ACCOUNT" && !clientId) throw new SaleError("ACCOUNT_NEEDS_CLIENT");

      const lines: Line[] = [];
      for (const item of input.items) {
        if ("usageMovementIds" in item) {
          const usages = await tx.stockMovement.findMany({
            where: { id: { in: item.usageMovementIds }, clinicId: input.clinicId, type: "USAGE", chargedSaleId: null, chargeWaived: false },
            include: { product: true },
          });
          if (usages.length !== item.usageMovementIds.length || usages.length === 0) throw new SaleError("USAGE_NOT_FOUND");
          const product = usages[0].product;
          if (usages.some((usage) => usage.productId !== product.id)) throw new SaleError("USAGE_NOT_FOUND");
          lines.push({
            productId: product.id,
            description: product.name,
            quantity: usages.reduce((sum, usage) => sum - usage.quantity, 0),
            unitCents: toCents(Number(product.price)),
            stockDeducted: false,
            usageIds: usages.map((usage) => usage.id),
          });
        } else if ("productId" in item) {
          const product = await tx.product.findFirst({ where: { id: item.productId, clinicId: input.clinicId, active: true } });
          if (!product) throw new SaleError("PRODUCT_NOT_FOUND");
          lines.push({ productId: product.id, description: product.name, quantity: item.quantity, unitCents: toCents(Number(product.price)), stockDeducted: product.trackStock });
        } else {
          lines.push({ productId: null, description: item.description, quantity: item.quantity, unitCents: toCents(item.unitPrice), stockDeducted: false });
        }
      }

      const appointmentIds = input.appointmentIds ?? [];
      if (appointmentIds.length > 0) {
        const count = await tx.appointment.count({ where: { id: { in: appointmentIds }, clinicId: input.clinicId, chargedSaleId: null } });
        if (count !== appointmentIds.length) throw new SaleError("APPOINTMENT_NOT_FOUND");
      }
      if (lines.length === 0) throw new SaleError("EMPTY");

      const totalCents = lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
      const sale = await tx.sale.create({
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
              stockDeducted: line.stockDeducted,
            })),
          },
        },
        include: { items: true },
      });

      for (const line of lines) {
        if (line.stockDeducted && line.productId) {
          await takeStock(tx, {
            clinicId: input.clinicId,
            productId: line.productId,
            type: "SALE",
            quantity: line.quantity,
            productName: line.description,
            userId: input.userId,
            saleId: sale.id,
            petId: input.petId ?? null,
          });
        }
        if (line.usageIds) {
          await tx.stockMovement.updateMany({ where: { id: { in: line.usageIds }, clinicId: input.clinicId }, data: { chargedSaleId: sale.id } });
        }
      }
      if (appointmentIds.length > 0) {
        await tx.appointment.updateMany({ where: { id: { in: appointmentIds }, clinicId: input.clinicId }, data: { chargedSaleId: sale.id } });
      }
      return sale;
    });
  } catch (error) {
    if (error instanceof StockError && error.code === "INSUFFICIENT_STOCK") throw new SaleError("INSUFFICIENT_STOCK", error.detail);
    throw error;
  }
}

/**
 * Anula una venta: devuelve el stock que ella misma descontó (a los mismos lotes), libera los turnos
 * y productos usados que cobraba (vuelven a "pendientes de cobro") y la saca de los totales.
 * Anular dos veces no hace nada.
 */
export async function voidSale(clinicId: string, saleId: string, userId: string) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, clinicId } });
    if (!sale) throw new SaleError("SALE_NOT_FOUND");
    // El cambio de estado condicionado evita devolver el stock dos veces ante dos anulaciones simultáneas.
    const changed = await tx.sale.updateMany({
      where: { id: sale.id, clinicId, status: "COMPLETED" },
      data: { status: "VOIDED", voidedAt: new Date(), voidedById: userId },
    });
    if (changed.count === 0) return sale;

    const movements = await tx.stockMovement.findMany({ where: { clinicId, saleId: sale.id, type: "SALE" } });
    const byProduct = new Map<string, { lotId: string | null; quantity: number }[]>();
    for (const movement of movements) {
      byProduct.set(movement.productId, [...(byProduct.get(movement.productId) ?? []), { lotId: movement.lotId, quantity: movement.quantity }]);
    }
    for (const [productId, rows] of byProduct) {
      await returnStock(tx, { clinicId, productId, type: "SALE_VOID", userId, saleId: sale.id, movements: rows });
    }
    await tx.stockMovement.updateMany({ where: { clinicId, chargedSaleId: sale.id }, data: { chargedSaleId: null } });
    await tx.appointment.updateMany({ where: { clinicId, chargedSaleId: sale.id }, data: { chargedSaleId: null } });
    return sale;
  });
}

export type ProductInput = { name: string; kind: ProductKind; price: number; cost?: number | null; trackStock: boolean; minStock: number; initialStock?: number };

function productData(input: ProductInput) {
  // Un servicio no tiene existencias: se ignora cualquier valor de stock que llegue.
  const trackStock = input.kind === "PRODUCT" && input.trackStock;
  return {
    name: input.name,
    kind: input.kind,
    price: input.price,
    cost: input.cost ?? null,
    trackStock,
    minStock: trackStock ? input.minStock : 0,
  };
}

/** Alta de producto. El stock inicial (si lo hay) queda registrado como primer movimiento. */
export async function createProduct(clinicId: string, input: ProductInput, userId?: string) {
  const prisma = getPrisma();
  const data = productData(input);
  const initial = data.trackStock ? Math.max(0, input.initialStock ?? 0) : 0;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { clinicId, ...data, stock: initial } });
    if (initial > 0) {
      await tx.stockMovement.create({ data: { clinicId, productId: product.id, type: "ADJUSTMENT", quantity: initial, note: "Stock inicial", userId: userId ?? null } });
    }
    return product;
  });
}

/**
 * Actualiza los datos de un producto (no su stock: eso se hace con ingreso de mercadería o ajuste,
 * para que quede en el historial). Devuelve `false` si no existe o es de otra clínica.
 */
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
 * Caja de un día (en la zona horaria de la clínica): ventas por medio de pago, cobros de cuenta
 * corriente, movimientos manuales y el efectivo que debería haber en el cajón. Las ventas "A cuenta"
 * suman a las ventas del día pero no a lo cobrado.
 */
export async function getCashDay(clinicId: string, timezone: string, date: string) {
  const prisma = getPrisma();
  const day = DateTime.fromISO(date, { zone: timezone });
  const range = { gte: day.startOf("day").toUTC().toJSDate(), lte: day.endOf("day").toUTC().toJSDate() };

  const [sales, movements, payments] = await Promise.all([
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
        client: { select: { id: true, name: true } },
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
    prisma.clientPayment.findMany({
      where: { clinicId, createdAt: range },
      orderBy: { createdAt: "desc" },
      select: { id: true, amount: true, paymentMethod: true, createdAt: true, client: { select: { id: true, name: true } }, user: { select: { name: true } } },
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
  let paymentsCents = 0;
  let cashPaymentsCents = 0;
  for (const payment of payments) {
    const cents = toCents(Number(payment.amount));
    paymentsCents += cents;
    if (payment.paymentMethod === "CASH") cashPaymentsCents += cents;
  }
  const movementCents = (type: "IN" | "OUT") => movements.filter((row) => row.type === type).reduce((sum, row) => sum + toCents(Number(row.amount)), 0);
  const cashIn = movementCents("IN");
  const cashOut = movementCents("OUT");

  return {
    sales: sales.map((sale) => ({ ...sale, total: Number(sale.total), items: sale.items.map((item) => ({ ...item, subtotal: Number(item.subtotal) })) })),
    movements: movements.map((row) => ({ ...row, amount: Number(row.amount) })),
    payments: payments.map((row) => ({ ...row, amount: Number(row.amount) })),
    salesTotal: salesCents / 100,
    salesCount: sales.filter((sale) => sale.status === "COMPLETED").length,
    byMethod: [...byMethod.entries()].map(([method, cents]) => ({ method, total: cents / 100 })).sort((a, b) => b.total - a.total),
    paymentsTotal: paymentsCents / 100,
    cashIn: cashIn / 100,
    cashOut: cashOut / 100,
    cashInDrawer: ((byMethod.get("CASH") ?? 0) + cashPaymentsCents + cashIn - cashOut) / 100,
  };
}

export type CashDay = Awaited<ReturnType<typeof getCashDay>>;

/** Catálogo de la clínica. `onlyActive` para los formularios; todo para la administración. */
export async function listProducts(clinicId: string, onlyActive = false) {
  const products = await getPrisma().product.findMany({
    where: { clinicId, ...(onlyActive ? { active: true } : {}) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return products.map((product) => {
    const price = Number(product.price);
    const cost = product.cost === null ? null : Number(product.cost);
    return {
      id: product.id,
      name: product.name,
      kind: product.kind,
      price,
      cost,
      /** Margen sobre el precio de venta (0,35 = 35 %). `null` sin costo cargado. */
      margin: cost !== null && price > 0 ? (price - cost) / price : null,
      trackStock: product.trackStock,
      stock: product.stock,
      minStock: product.minStock,
      active: product.active,
      lowStock: product.trackStock && product.stock <= product.minStock,
    };
  });
}

export type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];
