import { z } from "zod";

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayRange = z.object({
  enabled: z.boolean(),
  open: z.string().regex(time, "Horario invalido."),
  close: z.string().regex(time, "Horario invalido."),
  splitEnabled: z.boolean(),
  open2: z.string().regex(time, "Horario invalido."),
  close2: z.string().regex(time, "Horario invalido."),
})
  .refine((value) => !value.enabled || value.open < value.close, { message: "El cierre debe ser posterior a la apertura.", path: ["close"] })
  .refine((value) => !value.enabled || !value.splitEnabled || value.open2 < value.close2, { message: "El cierre del segundo turno debe ser posterior a su apertura.", path: ["close2"] })
  .refine((value) => !value.enabled || !value.splitEnabled || value.close <= value.open2, { message: "El segundo turno debe empezar después de que termine el primero.", path: ["open2"] });

/** El campo siempre viaja en el submit: cadena vacía significa "sin logo" (o se quitó), y si no, debe ser una imagen embebida como data URL. */
const logoUrl = z.union([z.string().trim().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,/, "El logo debe ser una imagen."), z.literal("")]);

export const clinicFormSchema = z.object({
  name: z.string().trim().min(2, "Ingresa el nombre de la clinica.").max(120),
  phone: z.string().trim().max(30).optional(),
  timezone: z.string().trim().min(1),
  defaultAppointmentDuration: z.number().int().min(10).max(180),
  days: z.record(z.string(), dayRange),
  logoUrl,
});
export type ClinicFormInput = z.infer<typeof clinicFormSchema>;


