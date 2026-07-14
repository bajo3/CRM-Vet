import { z } from "zod";

export const quoteItemSchema = z.object({
  description: z.string().trim().min(1, { error: "Ingresá una descripción." }).max(200),
  amount: z.coerce.number().min(0.01, { error: "El monto debe ser mayor a 0." }).max(100_000_000),
});

export const quoteFormSchema = z.object({
  title: z
    .union([z.string().trim().max(150), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  items: z.array(quoteItemSchema).min(1, { error: "Agregá al menos un ítem." }).max(50),
  notes: z
    .union([z.string().trim().max(2000), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/** Forma de los valores del formulario (antes de las transformaciones de zod). */
export type QuoteFormValues = z.input<typeof quoteFormSchema>;
/** Forma de los datos ya validados/transformados, la que reciben las server actions. */
export type QuoteFormInput = z.output<typeof quoteFormSchema>;
export type QuoteItemInput = z.output<typeof quoteItemSchema>;
