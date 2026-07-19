import { z } from "zod";

export const reminderTemplatesFormSchema = z.object({
  controlReminderTemplate: z.string().max(500, "El texto del recordatorio de control no puede superar los 500 caracteres."),
  appointmentReminderTemplate: z.string().max(500, "El texto del recordatorio de turno no puede superar los 500 caracteres."),
});
export type ReminderTemplatesFormInput = z.infer<typeof reminderTemplatesFormSchema>;
