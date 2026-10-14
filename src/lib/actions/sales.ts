"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { getSession, hasRole } from "../auth/session";
import { CLIENT_MANAGE_ROLES, CLINIC_CONFIG_ROLES } from "../auth/roles";
import { getPrisma } from "../prisma";
import { createCashMovement, createProduct, createSale, SaleError, setProductActive, updateProduct, voidSale } from "../services/sales";
import { adjustStock, registerPurchase, StockError } from "../services/stock";
import { waivePendingCharges } from "../services/pending-charges";
import { AccountError, registerClientPayment } from "../services/client-accounts";
import {
  adjustStockSchema,
  cashMovementSchema,
  clientPaymentSchema,
  productFormSchema,
  purchaseFormSchema,
  saleFormSchema,
  type AdjustStockInput,
  type CashMovementInput,
  type ClientPaymentInput,
  type ProductFormInput,
  type PurchaseFormInput,
  type SaleFormInput,
} from "../validation/sales";
import type { ActionFailure, ActionResult } from "./types";

const NO_SESSION: ActionFailure = { ok: false, message: "Tu sesión expiró. Iniciá sesión nuevamente." };
const NOT_AUTHORIZED: ActionFailure = { ok: false, message: "No tenés permisos para hacer esto." };

function invalid(error: { issues: { path: PropertyKey[]; message: string }[] }): ActionFailure {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, message: error.issues[0]?.message ?? "Revisá los datos ingresados.", fieldErrors };
}

function saleErrorMessage(error: SaleError): string {
  switch (error.code) {
    case "INSUFFICIENT_STOCK":
      return `No hay stock suficiente de ${error.detail ?? "ese producto"}.`;
    case "PRODUCT_NOT_FOUND":
      return "Uno de los productos ya no está disponible. Actualizá la página y volvé a intentar.";
    case "PET_NOT_FOUND":
      return "No encontramos esa mascota.";
    case "CLIENT_NOT_FOUND":
      return "No encontramos ese cliente.";
    case "SALE_NOT_FOUND":
      return "No encontramos esa venta.";
    case "ACCOUNT_NEEDS_CLIENT":
      return "Para vender a cuenta corriente elegí la mascota, así queda en la cuenta de su dueño/a.";
    case "USAGE_NOT_FOUND":
    case "APPOINTMENT_NOT_FOUND":
      return "Ese cobro pendiente ya se cobró o se descartó. Actualizá la página.";
    default:
      return "Agregá al menos un ítem.";
  }
}

function stockErrorMessage(error: StockError): string {
  if (error.code === "INSUFFICIENT_STOCK") return `No hay stock suficiente de ${error.detail ?? "ese producto"}.`;
  if (error.code === "NOT_TRACKED") return "Ese producto no controla stock. Activalo desde Editar.";
  return "No encontramos ese producto.";
}

function revalidateSales() {
  revalidatePath("/ventas");
  revalidatePath("/ventas/productos", "layout");
}

export type CreateSaleResult = ActionResult<{ id: string }>;

/** Registra una venta cobrada. Puede hacerlo cualquier integrante de la clínica. */
export async function createSaleAction(input: SaleFormInput): Promise<CreateSaleResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;

  const parsed = saleFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  try {
    const sale = await createSale({
      clinicId: session.clinicId,
      userId: session.userId,
      petId: parsed.data.petId || null,
      clientId: parsed.data.clientId || null,
      paymentMethod: parsed.data.paymentMethod as PaymentMethod,
      notes: parsed.data.notes,
      items: parsed.data.items,
      appointmentIds: parsed.data.appointmentIds,
    });
    revalidateSales();
    revalidatePath("/clientes");
    return { ok: true, id: sale.id };
  } catch (error) {
    if (error instanceof SaleError) return { ok: false, message: saleErrorMessage(error) };
    throw error;
  }
}

/** Anula una venta (devuelve stock). Solo quienes administran la clínica. */
export async function voidSaleAction(saleId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return NOT_AUTHORIZED;
  try {
    await voidSale(session.clinicId, saleId, session.userId);
  } catch (error) {
    if (error instanceof SaleError) return { ok: false, message: saleErrorMessage(error) };
    throw error;
  }
  revalidateSales();
  revalidatePath("/clientes");
  return { ok: true };
}

/** Crea o edita un producto/servicio del catálogo. Solo quienes administran la clínica. */
export async function saveProductAction(productId: string | null, input: ProductFormInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return NOT_AUTHORIZED;

  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  if (productId) {
    if (!(await updateProduct(session.clinicId, productId, parsed.data))) return { ok: false, message: "No encontramos ese producto." };
  } else {
    await createProduct(session.clinicId, parsed.data, session.userId);
  }
  revalidateSales();
  return { ok: true };
}

export async function setProductActiveAction(productId: string, active: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return NOT_AUTHORIZED;
  if (!(await setProductActive(session.clinicId, productId, active))) return { ok: false, message: "No encontramos ese producto." };
  revalidateSales();
  return { ok: true };
}

/** Ingreso de mercadería. Recepción y administración. */
export async function registerPurchaseAction(productId: string, input: PurchaseFormInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = purchaseFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const clinic = await getPrisma().clinic.findUnique({ where: { id: session.clinicId }, select: { timezone: true } });
  try {
    await registerPurchase({
      clinicId: session.clinicId,
      userId: session.userId,
      productId,
      quantity: parsed.data.quantity,
      unitCost: parsed.data.unitCost,
      supplier: parsed.data.supplier,
      lotNumber: parsed.data.lotNumber,
      expiresOn: parsed.data.expiresOn,
      timezone: clinic?.timezone ?? "America/Argentina/Buenos_Aires",
    });
  } catch (error) {
    if (error instanceof StockError) return { ok: false, message: stockErrorMessage(error) };
    throw error;
  }
  revalidateSales();
  return { ok: true };
}

/** Ajuste de inventario con motivo. Solo quienes administran la clínica. */
export async function adjustStockAction(productId: string, input: AdjustStockInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return NOT_AUTHORIZED;

  const parsed = adjustStockSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await adjustStock({ clinicId: session.clinicId, userId: session.userId, productId, ...parsed.data });
  } catch (error) {
    if (error instanceof StockError) return { ok: false, message: stockErrorMessage(error) };
    throw error;
  }
  revalidateSales();
  return { ok: true };
}

/** "No se cobra": descarta los pendientes de cobro de una mascota. Recepción y administración. */
export async function waivePendingChargesAction(petId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;
  await waivePendingCharges(session.clinicId, petId);
  revalidatePath("/ventas");
  return { ok: true };
}

/** Pago a cuenta corriente. Recepción y administración. */
export async function registerClientPaymentAction(clientId: string, input: ClientPaymentInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = clientPaymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await registerClientPayment({
      clinicId: session.clinicId,
      userId: session.userId,
      clientId,
      amount: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod as PaymentMethod,
      note: parsed.data.note,
    });
  } catch (error) {
    if (error instanceof AccountError) return { ok: false, message: error.code === "INVALID_METHOD" ? "Elegí cómo pagó." : "No encontramos ese cliente." };
    throw error;
  }
  revalidatePath(`/clientes/${clientId}/cuenta`);
  revalidatePath("/clientes");
  revalidatePath("/ventas");
  return { ok: true };
}

/** Ingreso o egreso manual de efectivo. Recepción y administración. */
export async function createCashMovementAction(input: CashMovementInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLIENT_MANAGE_ROLES)) return NOT_AUTHORIZED;

  const parsed = cashMovementSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  await createCashMovement({ clinicId: session.clinicId, userId: session.userId, ...parsed.data });
  revalidatePath("/ventas");
  return { ok: true };
}
