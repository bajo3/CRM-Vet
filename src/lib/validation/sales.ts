import { z } from "zod";

export const PAYMENT_METHODS = ["CASH", "DEBIT", "CREDIT", "TRANSFER", "MERCADO_PAGO", "OTHER"] as const;

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  CASH: "Efectivo",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  TRANSFER: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  OTHER: "Otro",
};

const money = z.number({ error: "Ingresá un importe." }).positive({ error: "El importe debe ser mayor a cero." }).max(99_999_999, { error: "El importe es demasiado alto." });
const quantity = z.number({ error: "Ingresá la cantidad." }).int({ error: "La cantidad debe ser un número entero." }).min(1, { error: "La cantidad mínima es 1." }).max(9_999);

const saleItemSchema = z.union([
  z.object({ productId: z.string().min(1), quantity }),
  z.object({ description: z.string().trim().min(1, { error: "Describí el ítem." }).max(160), unitPrice: money, quantity }),
]);

export const saleFormSchema = z.object({
  petId: z.string().optional().or(z.literal("")),
  clientId: z.string().optional().or(z.literal("")),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Elegí el medio de pago." }),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  items: z.array(saleItemSchema).min(1, { error: "Agregá al menos un ítem." }).max(50),
});
export type SaleFormInput = z.infer<typeof saleFormSchema>;

export const productFormSchema = z.object({
  name: z.string().trim().min(1, { error: "Ingresá el nombre." }).max(120),
  kind: z.enum(["PRODUCT", "SERVICE"]),
  price: money,
  trackStock: z.boolean(),
  stock: z.number().int({ error: "El stock debe ser un número entero." }).min(0, { error: "El stock no puede ser negativo." }).max(999_999),
  minStock: z.number().int({ error: "El mínimo debe ser un número entero." }).min(0, { error: "El mínimo no puede ser negativo." }).max(999_999),
});
export type ProductFormInput = z.infer<typeof productFormSchema>;

export const cashMovementSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: money,
  description: z.string().trim().min(2, { error: "Contá de qué es el movimiento." }).max(160),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
