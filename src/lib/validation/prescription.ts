import { z } from "zod";

export const prescriptionFormSchema = z.object({
  content: z
    .string()
    .trim()
    .min(10, { error: "Escribí la indicación completa (mínimo 10 caracteres)." })
    .max(4000),
});

/** Forma de los valores del formulario (antes de las transformaciones de zod). */
export type PrescriptionFormValues = z.input<typeof prescriptionFormSchema>;
/** Forma de los datos ya validados/transformados, la que reciben las server actions. */
export type PrescriptionFormInput = z.output<typeof prescriptionFormSchema>;
