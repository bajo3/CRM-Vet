import { z } from "zod";

/**
 * `date`/`time` viajan como strings sueltos desde el formulario (igual que `appointmentFormSchema`)
 * y se combinan con la zona horaria de la clínica en la server action, no acá: este schema no sabe
 * de timezones. La validación de "tiene que ser en el futuro" también queda para la action, porque
 * ahí sí se conoce `clinic.timezone` para comparar contra la hora actual correctamente.
 */
export const createScheduledMessageSchema = z.object({
  clientId: z.string().trim().min(1, { error: "Elegí un cliente." }),
  content: z
    .string()
    .trim()
    .min(1, { error: "Escribí el mensaje." })
    .max(1000, { error: "Máximo 1000 caracteres." }),
  date: z.string().trim().date({ error: "Elegí una fecha válida." }),
  time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, { error: "Elegí un horario válido." }),
});
export type CreateScheduledMessageValues = z.input<typeof createScheduledMessageSchema>;
export type CreateScheduledMessageInput = z.output<typeof createScheduledMessageSchema>;

export const cancelScheduledMessageSchema = z.string().trim().min(1);
