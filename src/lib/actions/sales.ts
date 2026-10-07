"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasRole } from "../auth/session";
import { CLIENT_MANAGE_ROLES, CLINIC_CONFIG_ROLES } from "../auth/roles";
import { createCashMovement, createProduct, createSale, SaleError, setProductActive, updateProduct, voidSale } from "../services/sales";
import { cashMovementSchema, productFormSchema, saleFormSchema, type CashMovementInput, type ProductFormInput, type SaleFormInput } from "../validation/sales";
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
    default:
      return "Agregá al menos un ítem.";
  }
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
      paymentMethod: parsed.data.paymentMethod,
      notes: parsed.data.notes,
      items: parsed.data.items,
    });
    revalidatePath("/ventas");
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
  revalidatePath("/ventas");
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
    await createProduct(session.clinicId, parsed.data);
  }
  revalidatePath("/ventas");
  return { ok: true };
}

export async function setProductActiveAction(productId: string, active: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!hasRole(session, CLINIC_CONFIG_ROLES)) return NOT_AUTHORIZED;
  if (!(await setProductActive(session.clinicId, productId, active))) return { ok: false, message: "No encontramos ese producto." };
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
