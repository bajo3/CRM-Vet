import { DateTime } from "luxon";
import { getPrisma } from "../prisma";

/** Solo se reclaman cobros de este lapso: lo más viejo se da por resuelto fuera del sistema. */
export const PENDING_CHARGE_DAYS = 30;

export type PendingUsageLine = { productId: string; productName: string; unitPrice: number; quantity: number; movementIds: string[] };

export type PendingCharge = {
  petId: string;
  petName: string;
  clientName: string;
  appointments: { id: string; startAt: Date; reason: string }[];
  usages: PendingUsageLine[];
  /** Importe orientativo de los productos usados (los turnos no tienen precio propio). */
  usagesTotal: number;
  lastActivityAt: Date;
};

/**
 * Lo que se hizo y todavía no se cobró, agrupado por mascota: turnos atendidos sin venta asociada y
 * productos usados en consulta sin cobrar, de los últimos `PENDING_CHARGE_DAYS` días.
 */
export async function listPendingCharges(clinicId: string, petId?: string): Promise<PendingCharge[]> {
  const prisma = getPrisma();
  const since = DateTime.now().minus({ days: PENDING_CHARGE_DAYS }).toJSDate();
  const [appointments, usages] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId, status: "ATTENDED", chargedSaleId: null, chargeWaivedAt: null, startAt: { gte: since }, ...(petId ? { petId } : {}) },
      orderBy: { startAt: "asc" },
      select: { id: true, startAt: true, reason: true, pet: { select: { id: true, name: true, client: { select: { name: true } } } } },
    }),
    prisma.stockMovement.findMany({
      where: { clinicId, type: "USAGE", chargedSaleId: null, chargeWaived: false, petId: petId ?? { not: null }, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        quantity: true,
        createdAt: true,
        product: { select: { id: true, name: true, price: true } },
        pet: { select: { id: true, name: true, client: { select: { name: true } } } },
      },
    }),
  ]);

  const byPet = new Map<string, PendingCharge>();
  const entry = (pet: { id: string; name: string; client: { name: string } }, at: Date) => {
    const current = byPet.get(pet.id) ?? { petId: pet.id, petName: pet.name, clientName: pet.client.name, appointments: [], usages: [], usagesTotal: 0, lastActivityAt: at };
    if (at > current.lastActivityAt) current.lastActivityAt = at;
    byPet.set(pet.id, current);
    return current;
  };
  for (const appointment of appointments) {
    entry(appointment.pet, appointment.startAt).appointments.push({ id: appointment.id, startAt: appointment.startAt, reason: appointment.reason });
  }
  for (const usage of usages) {
    if (!usage.pet) continue;
    const current = entry(usage.pet, usage.createdAt);
    const line = current.usages.find((row) => row.productId === usage.product.id);
    if (line) {
      line.quantity += -usage.quantity;
      line.movementIds.push(usage.id);
    } else {
      current.usages.push({ productId: usage.product.id, productName: usage.product.name, unitPrice: Number(usage.product.price), quantity: -usage.quantity, movementIds: [usage.id] });
    }
  }
  for (const charge of byPet.values()) {
    charge.usagesTotal = charge.usages.reduce((sum, line) => sum + Math.round(line.unitPrice * 100) * line.quantity, 0) / 100;
  }
  return [...byPet.values()].sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

/** "No se cobra": saca de pendientes los turnos y productos usados de una mascota. */
export async function waivePendingCharges(clinicId: string, petId: string): Promise<number> {
  const prisma = getPrisma();
  const pending = await listPendingCharges(clinicId, petId);
  const charge = pending[0];
  if (!charge) return 0;
  const [appointments, usages] = await prisma.$transaction([
    prisma.appointment.updateMany({ where: { clinicId, id: { in: charge.appointments.map((row) => row.id) }, chargedSaleId: null }, data: { chargeWaivedAt: new Date() } }),
    prisma.stockMovement.updateMany({
      where: { clinicId, id: { in: charge.usages.flatMap((line) => line.movementIds) }, chargedSaleId: null },
      data: { chargeWaived: true },
    }),
  ]);
  return appointments.count + usages.count;
}
