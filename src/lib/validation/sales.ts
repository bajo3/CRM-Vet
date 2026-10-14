import { z } from "zod";

export const PAYMENT_METHODS = ["CASH", "DEBIT", "CREDIT", "TRANSFER", "MERCADO_PAGO", "OTHER", "ACCOUNT"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

/** Medios con los que entra dinero (para pagos de cuenta corriente, "A cuenta" no aplica). */
export const MONEY_PAYMENT_METHODS = PAYMENT_METHODS.filter((method) => method !== "ACCOUNT");

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  CASH: "Efectivo",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  TRANSFER: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  OTHER: "Otro",
  ACCOUNT: "A cuenta",
};

const money = z.number({ error: "Ingresá un importe." }).positive({ error: "El importe debe ser mayor a cero." }).max(99_999_999, { error: "El importe es demasiado alto." });
const quantity = z.number({ error: "Ingresá la cantidad." }).int({ error: "La cantidad debe ser un número entero." }).min(1, { error: "La cantidad mínima es 1." }).max(9_999);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const saleItemSchema = z.union([
  z.object({ usageMovementIds: z.array(z.string().min(1)).min(1).max(50) }),
  z.object({ productId: z.string().min(1), quantity }),
  z.object({ description: z.string().trim().min(1, { error: "Describí el ítem." }).max(160), unitPrice: money, quantity }),
]);

export const saleFormSchema = z.object({
  petId: z.string().optional().or(z.literal("")),
  clientId: z.string().optional().or(z.literal("")),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Elegí el medio de pago." }),
  notes: optionalText(500),
  items: z.array(saleItemSchema).min(1, { error: "Agregá al menos un ítem." }).max(50),
  appointmentIds: z.array(z.string().min(1)).max(20).default([]),
});
export type SaleFormInput = z.input<typeof saleFormSchema>;

export const productFormSchema = z.object({
  name: z.string().trim().min(1, { error: "Ingresá el nombre." }).max(120),
  kind: z.enum(["PRODUCT", "SERVICE"]),
  price: money,
  cost: z.number().min(0, { error: "El costo no puede ser negativo." }).max(99_999_999).nullable(),
  trackStock: z.boolean(),
  /** Solo se usa al crear el producto; después el stock cambia con ingresos y ajustes. */
  initialStock: z.number().int({ error: "El stock debe ser un número entero." }).min(0, { error: "El stock no puede ser negativo." }).max(999_999),
  minStock: z.number().int({ error: "El mínimo debe ser un número entero." }).min(0, { error: "El mínimo no puede ser negativo." }).max(999_999),
});
export type ProductFormInput = z.infer<typeof productFormSchema>;

export const purchaseFormSchema = z.object({
  quantity,
  unitCost: z.number().min(0, { error: "El costo no puede ser negativo." }).max(99_999_999).nullable(),
  supplier: optionalText(120),
  lotNumber: optionalText(60),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Ingresá una fecha válida." }).optional().or(z.literal("")),
});
export type PurchaseFormInput = z.infer<typeof purchaseFormSchema>;

export const adjustStockSchema = z.object({
  newStock: z.number({ error: "Ingresá el stock contado." }).int({ error: "El stock debe ser un número entero." }).min(0, { error: "El stock no puede ser negativo." }).max(999_999),
  note: z.string().trim().min(2, { error: "Contá el motivo (ej: conteo, rotura, vencido)." }).max(160),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const clientPaymentSchema = z.object({
  amount: money,
  paymentMethod: z.enum(MONEY_PAYMENT_METHODS as [string, ...string[]], { error: "Elegí el medio de pago." }),
  note: optionalText(160),
});
export type ClientPaymentInput = z.infer<typeof clientPaymentSchema>;

export const cashMovementSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: money,
  description: z.string().trim().min(2, { error: "Contá de qué es el movimiento." }).max(160),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
