import { z } from "zod";

export const clientFormSchema = z.object({
  name: z.string().trim().min(1, { error: "Ingresá el nombre y apellido." }).max(120),
  phone: z.string().trim().min(6, { error: "Ingresá un teléfono válido." }).max(30),
  email: z
    .union([z.string().trim().email({ error: "Ingresá un correo válido." }), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  address: z
    .union([z.string().trim().max(200), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  remindersEnabled: z.boolean().default(true),
});

/** Forma de los valores del formulario (antes de las transformaciones de zod). */
export type ClientFormValues = z.input<typeof clientFormSchema>;
/** Forma de los datos ya validados/transformados, la que reciben las server actions. */
export type ClientFormInput = z.output<typeof clientFormSchema>;
