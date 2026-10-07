import { z } from "zod";
import { normalizePhone } from "../phone";

export const onlineBookingSchema = z.object({
  slug: z.string().min(1).max(80),
  clientName: z.string().trim().min(2, { error: "Ingresá tu nombre y apellido." }).max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => normalizePhone(value).length >= 8, { error: "Ingresá un teléfono válido, con código de área." }),
  petName: z.string().trim().min(1, { error: "Ingresá el nombre de tu mascota." }).max(80),
  reason: z.string().trim().min(2, { error: "Contanos el motivo de la consulta." }).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Elegí una fecha." }),
  time: z.string().regex(/^\d{2}:\d{2}$/, { error: "Elegí un horario." }),
});

export type OnlineBookingFormInput = z.infer<typeof onlineBookingSchema>;
