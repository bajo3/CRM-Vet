import type { Prisma, StockMovementType } from "@prisma/client";
import { DateTime } from "luxon";
import { getPrisma } from "../prisma";

type Tx = Prisma.TransactionClient;

/** Un lote se avisa como "por vencer" desde estos días antes de su vencimiento. */
export const EXPIRY_WARNING_DAYS = 30;

export class StockError extends Error {
  constructor(
    public readonly code: "PRODUCT_NOT_FOUND" | "NOT_TRACKED" | "INSUFFICIENT_STOCK",
    public readonly detail?: string
  ) {
    super(code);
  }
}

type MovementContext = {
  clinicId: string;
  productId: string;
  type: StockMovementType;
  userId?: string | null;
  saleId?: string | null;
  medicalRecordId?: string | null;
  petId?: string | null;
  note?: string | null;
};

/**
 * Descuenta `quantity` unidades de un producto con stock controlado y registra el movimiento.
 * El total se descuenta con un `updateMany` condicionado (si no alcanza, falla sin tocar nada). Los
 * lotes se consumen del que vence antes al que vence después; si los lotes registrados no cubren todo
 * (por ejemplo, stock cargado antes de usar lotes), el resto sale "sin lote". Devuelve los movimientos
 * creados (uno por lote consumido).
 */
export async function takeStock(tx: Tx, ctx: MovementContext & { quantity: number; productName: string }) {
  const updated = await tx.product.updateMany({
    where: { id: ctx.productId, clinicId: ctx.clinicId, trackStock: true, stock: { gte: ctx.quantity } },
    data: { stock: { decrement: ctx.quantity } },
  });
  if (updated.count === 0) throw new StockError("INSUFFICIENT_STOCK", ctx.productName);

  const lots = await tx.stockLot.findMany({
    where: { clinicId: ctx.clinicId, productId: ctx.productId, quantity: { gt: 0 } },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  const base = {
    clinicId: ctx.clinicId,
    productId: ctx.productId,
    type: ctx.type,
    userId: ctx.userId ?? null,
    saleId: ctx.saleId ?? null,
    medicalRecordId: ctx.medicalRecordId ?? null,
    petId: ctx.petId ?? null,
    note: ctx.note ?? null,
  };
  const created = [];
  let remaining = ctx.quantity;
  for (const lot of lots) {
    if (remaining === 0) break;
    const take = Math.min(lot.quantity, remaining);
    await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
    created.push(await tx.stockMovement.create({ data: { ...base, lotId: lot.id, quantity: -take } }));
    remaining -= take;
  }
  if (remaining > 0) created.push(await tx.stockMovement.create({ data: { ...base, quantity: -remaining } }));
  return created;
}

/** Devuelve stock (anulación de venta): suma al total y a los lotes de donde había salido. */
export async function returnStock(tx: Tx, ctx: MovementContext & { movements: { lotId: string | null; quantity: number }[] }) {
  let total = 0;
  for (const movement of ctx.movements) {
    const quantity = -movement.quantity;
    if (quantity <= 0) continue;
    total += quantity;
    if (movement.lotId) await tx.stockLot.updateMany({ where: { id: movement.lotId, clinicId: ctx.clinicId }, data: { quantity: { increment: quantity } } });
    await tx.stockMovement.create({
      data: {
        clinicId: ctx.clinicId,
        productId: ctx.productId,
        type: ctx.type,
        quantity,
        lotId: movement.lotId,
        userId: ctx.userId ?? null,
        saleId: ctx.saleId ?? null,
        note: ctx.note ?? null,
      },
    });
  }
  if (total > 0) await tx.product.updateMany({ where: { id: ctx.productId, clinicId: ctx.clinicId }, data: { stock: { increment: total } } });
}

export type PurchaseInput = {
  clinicId: string;
  userId: string;
  productId: string;
  quantity: number;
  unitCost?: number | null;
  supplier?: string | null;
  lotNumber?: string | null;
  /** Fecha ISO (YYYY-MM-DD) en la zona horaria de la clínica. */
  expiresOn?: string | null;
  timezone: string;
};

/**
 * Ingreso de mercadería: suma stock, crea el lote (si vino número o vencimiento) y actualiza el último
 * costo del producto. Activa el control de stock si el producto todavía no lo tenía.
 */
export async function registerPurchase(input: PurchaseInput) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: input.productId, clinicId: input.clinicId } });
    if (!product) throw new StockError("PRODUCT_NOT_FOUND");
    if (product.kind !== "PRODUCT") throw new StockError("NOT_TRACKED", product.name);

    const expiresAt = input.expiresOn ? DateTime.fromISO(input.expiresOn, { zone: input.timezone }).endOf("day").toUTC().toJSDate() : null;
    const lot =
      input.lotNumber || expiresAt
        ? await tx.stockLot.create({
            data: { clinicId: input.clinicId, productId: product.id, lotNumber: input.lotNumber || null, expiresAt, quantity: input.quantity },
          })
        : null;

    await tx.product.update({
      where: { id: product.id },
      data: {
        trackStock: true,
        stock: { increment: input.quantity },
        ...(input.unitCost ? { cost: input.unitCost } : {}),
      },
    });
    return tx.stockMovement.create({
      data: {
        clinicId: input.clinicId,
        productId: product.id,
        type: "PURCHASE",
        quantity: input.quantity,
        lotId: lot?.id ?? null,
        unitCost: input.unitCost ?? null,
        supplier: input.supplier || null,
        userId: input.userId,
      },
    });
  });
}

/**
 * Ajuste de inventario (conteo físico, rotura, vencido descartado): fija el stock en `newStock` y
 * registra la diferencia con su motivo. Un ajuste hacia abajo descuenta de los lotes como una salida.
 */
export async function adjustStock(input: { clinicId: string; userId: string; productId: string; newStock: number; note: string }) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: input.productId, clinicId: input.clinicId } });
    if (!product) throw new StockError("PRODUCT_NOT_FOUND");
    if (!product.trackStock) throw new StockError("NOT_TRACKED", product.name);
    const diff = input.newStock - product.stock;
    if (diff === 0) return null;
    const ctx = { clinicId: input.clinicId, productId: product.id, type: "ADJUSTMENT" as const, userId: input.userId, note: input.note };
    if (diff < 0) {
      await takeStock(tx, { ...ctx, quantity: -diff, productName: product.name });
      return diff;
    }
    await tx.product.update({ where: { id: product.id }, data: { stock: { increment: diff } } });
    await tx.stockMovement.create({ data: { ...ctx, quantity: diff } });
    return diff;
  });
}

export type UsageInput = { productId: string; quantity: number };

/**
 * Productos aplicados en una atención (vacuna, medicación): se descuentan del stock y quedan como
 * "pendientes de cobro" de la mascota hasta que se cobren o se marquen como "no se cobra".
 * Los productos sin control de stock igual se registran (cantidad 0 de stock) para poder cobrarlos.
 */
export async function recordUsage(tx: Tx, input: { clinicId: string; userId: string; petId: string; medicalRecordId: string; items: UsageInput[] }) {
  for (const item of input.items) {
    const product = await tx.product.findFirst({ where: { id: item.productId, clinicId: input.clinicId, active: true } });
    if (!product) throw new StockError("PRODUCT_NOT_FOUND");
    const ctx = { clinicId: input.clinicId, productId: product.id, type: "USAGE" as const, userId: input.userId, petId: input.petId, medicalRecordId: input.medicalRecordId };
    if (product.trackStock) {
      await takeStock(tx, { ...ctx, quantity: item.quantity, productName: product.name });
    } else {
      await tx.stockMovement.create({ data: { ...ctx, quantity: -item.quantity } });
    }
  }
}

/** Verifica antes de guardar una atención que haya stock para todos los productos aplicados. */
export async function assertUsageAvailable(clinicId: string, items: UsageInput[]) {
  const products = await getPrisma().product.findMany({ where: { clinicId, id: { in: items.map((item) => item.productId) }, active: true } });
  for (const item of items) {
    const product = products.find((row) => row.id === item.productId);
    if (!product) throw new StockError("PRODUCT_NOT_FOUND");
    const needed = items.filter((row) => row.productId === item.productId).reduce((sum, row) => sum + row.quantity, 0);
    if (product.trackStock && product.stock < needed) throw new StockError("INSUFFICIENT_STOCK", product.name);
  }
}

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  PURCHASE: "Ingreso de mercadería",
  SALE: "Venta",
  SALE_VOID: "Venta anulada",
  USAGE: "Usado en consulta",
  ADJUSTMENT: "Ajuste",
};

export function movementLabel(type: StockMovementType): string {
  return MOVEMENT_LABELS[type];
}

/** Detalle de stock de un producto: lotes vigentes e historial de movimientos (los 100 más recientes). */
export async function getProductStock(clinicId: string, productId: string) {
  const prisma = getPrisma();
  const product = await prisma.product.findFirst({ where: { id: productId, clinicId } });
  if (!product) return null;
  const [lots, movements] = await Promise.all([
    prisma.stockLot.findMany({
      where: { clinicId, productId, quantity: { gt: 0 } },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.stockMovement.findMany({
      where: { clinicId, productId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        quantity: true,
        unitCost: true,
        supplier: true,
        note: true,
        createdAt: true,
        lot: { select: { lotNumber: true } },
        user: { select: { name: true } },
        pet: { select: { name: true } },
      },
    }),
  ]);
  const now = Date.now();
  const warningLimit = now + EXPIRY_WARNING_DAYS * 86_400_000;
  return {
    product: { ...product, price: Number(product.price), cost: product.cost === null ? null : Number(product.cost) },
    lots: lots.map((lot) => ({
      ...lot,
      expiry: !lot.expiresAt ? ("none" as const) : lot.expiresAt.getTime() < now ? ("expired" as const) : lot.expiresAt.getTime() <= warningLimit ? ("soon" as const) : ("ok" as const),
    })),
    movements: movements.map((row) => ({ ...row, unitCost: row.unitCost === null ? null : Number(row.unitCost) })),
  };
}

/** Lotes con unidades que ya vencieron o vencen dentro de `EXPIRY_WARNING_DAYS`. */
export async function listExpiringLots(clinicId: string) {
  const limit = DateTime.now().plus({ days: EXPIRY_WARNING_DAYS }).toJSDate();
  const lots = await getPrisma().stockLot.findMany({
    where: { clinicId, quantity: { gt: 0 }, expiresAt: { lte: limit }, product: { active: true } },
    orderBy: { expiresAt: "asc" },
    select: { id: true, lotNumber: true, expiresAt: true, quantity: true, product: { select: { id: true, name: true } } },
  });
  const now = new Date();
  // Varios ingresos con el mismo lote y vencimiento se muestran como uno solo.
  const grouped = new Map<string, { id: string; lotNumber: string | null; expiresAt: Date | null; quantity: number; product: { id: string; name: string }; expired: boolean }>();
  for (const lot of lots) {
    const key = `${lot.product.id}|${lot.lotNumber ?? ""}|${lot.expiresAt?.toISOString() ?? ""}`;
    const current = grouped.get(key);
    if (current) current.quantity += lot.quantity;
    else grouped.set(key, { ...lot, expired: Boolean(lot.expiresAt && lot.expiresAt < now) });
  }
  return [...grouped.values()];
}

export type ExpiringLot = Awaited<ReturnType<typeof listExpiringLots>>[number];
