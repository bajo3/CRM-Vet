import type { PaymentMethod } from "@prisma/client";
import { getPrisma } from "../prisma";
import { toCents } from "./sales";

export class AccountError extends Error {
  constructor(public readonly code: "CLIENT_NOT_FOUND" | "INVALID_METHOD") {
    super(code);
  }
}

/**
 * Saldo de cuenta corriente por cliente (positivo = el cliente debe). Deuda = ventas "A cuenta" no
 * anuladas; se descuentan los pagos registrados.
 */
export async function getBalances(clinicId: string, clientIds?: string[]): Promise<Map<string, number>> {
  const prisma = getPrisma();
  const clientFilter = clientIds ? { clientId: { in: clientIds } } : { clientId: { not: null } };
  const [debts, payments] = await Promise.all([
    prisma.sale.groupBy({ by: ["clientId"], where: { clinicId, paymentMethod: "ACCOUNT", status: "COMPLETED", ...clientFilter }, _sum: { total: true } }),
    prisma.clientPayment.groupBy({ by: ["clientId"], where: { clinicId, ...(clientIds ? { clientId: { in: clientIds } } : {}) }, _sum: { amount: true } }),
  ]);
  const cents = new Map<string, number>();
  for (const row of debts) if (row.clientId) cents.set(row.clientId, (cents.get(row.clientId) ?? 0) + toCents(Number(row._sum.total ?? 0)));
  for (const row of payments) cents.set(row.clientId, (cents.get(row.clientId) ?? 0) - toCents(Number(row._sum.amount ?? 0)));
  return new Map([...cents.entries()].map(([id, value]) => [id, value / 100]));
}

/** Clientes con deuda, de mayor a menor. */
export async function listDebtors(clinicId: string) {
  const balances = await getBalances(clinicId);
  const ids = [...balances.entries()].filter(([, balance]) => balance > 0).map(([id]) => id);
  if (ids.length === 0) return [];
  const clients = await getPrisma().client.findMany({ where: { clinicId, id: { in: ids } }, select: { id: true, name: true, phone: true } });
  return clients.map((client) => ({ ...client, balance: balances.get(client.id) ?? 0 })).sort((a, b) => b.balance - a.balance);
}

/** Movimientos de la cuenta de un cliente (ventas a cuenta y pagos), del más reciente al más viejo. */
export async function getClientAccount(clinicId: string, clientId: string) {
  const prisma = getPrisma();
  const client = await prisma.client.findFirst({ where: { id: clientId, clinicId }, select: { id: true, name: true, phone: true } });
  if (!client) return null;
  const [sales, payments, balances] = await Promise.all([
    prisma.sale.findMany({
      where: { clinicId, clientId, paymentMethod: "ACCOUNT" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, total: true, status: true, createdAt: true, pet: { select: { name: true } }, items: { select: { description: true, quantity: true } } },
    }),
    prisma.clientPayment.findMany({
      where: { clinicId, clientId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, amount: true, paymentMethod: true, note: true, createdAt: true, user: { select: { name: true } } },
    }),
    getBalances(clinicId, [clientId]),
  ]);
  const entries = [
    ...sales.map((sale) => ({
      kind: "sale" as const,
      id: sale.id,
      at: sale.createdAt,
      amount: Number(sale.total),
      voided: sale.status === "VOIDED",
      detail: sale.items.map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.description}` : item.description)).join(", ") + (sale.pet ? ` (${sale.pet.name})` : ""),
    })),
    ...payments.map((payment) => ({
      kind: "payment" as const,
      id: payment.id,
      at: payment.createdAt,
      amount: Number(payment.amount),
      voided: false,
      detail: payment.note ?? "",
      paymentMethod: payment.paymentMethod,
      userName: payment.user.name,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { client, balance: balances.get(clientId) ?? 0, entries };
}

/** Registra un pago a cuenta. "A cuenta" no es un medio válido para pagar una deuda. */
export async function registerClientPayment(input: { clinicId: string; userId: string; clientId: string; amount: number; paymentMethod: PaymentMethod; note?: string | null }) {
  if (input.paymentMethod === "ACCOUNT") throw new AccountError("INVALID_METHOD");
  const prisma = getPrisma();
  const client = await prisma.client.findFirst({ where: { id: input.clientId, clinicId: input.clinicId }, select: { id: true } });
  if (!client) throw new AccountError("CLIENT_NOT_FOUND");
  return prisma.clientPayment.create({
    data: {
      clinicId: input.clinicId,
      clientId: client.id,
      userId: input.userId,
      amount: toCents(input.amount) / 100,
      paymentMethod: input.paymentMethod,
      note: input.note || null,
    },
  });
}
