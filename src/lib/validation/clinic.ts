import { z } from "zod";

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayRange = z.object({ enabled: z.boolean(), open: z.string().regex(time, "Horario invalido."), close: z.string().regex(time, "Horario invalido.") })
  .refine((value) => !value.enabled || value.open < value.close, { message: "El cierre debe ser posterior a la apertura.", path: ["close"] });

export const clinicFormSchema = z.object({
  name: z.string().trim().min(2, "Ingresa el nombre de la clinica.").max(120),
  phone: z.string().trim().max(30).optional(),
  timezone: z.string().trim().min(1),
  defaultAppointmentDuration: z.number().int().min(10).max(180),
  days: z.record(z.string(), dayRange),
});
export type ClinicFormInput = z.infer<typeof clinicFormSchema>;


