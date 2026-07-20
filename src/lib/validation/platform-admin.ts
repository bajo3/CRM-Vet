import { z } from "zod";

export const approveClinicSchema = z.object({
  clinicId: z.string().min(1),
});
export type ApproveClinicInput = z.infer<typeof approveClinicSchema>;

export const rejectClinicSchema = z.object({
  clinicId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});
export type RejectClinicInput = z.infer<typeof rejectClinicSchema>;

export const updateClinicWhatsappBridgeSchema = z.object({
  clinicId: z.string().min(1),
  whatsappSessionKey: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9-]*$/, "Solo minúsculas, números y guiones (ej: san-martin).")
    .optional()
    .or(z.literal("")),
  whatsappBridgeUrl: z.string().trim().url("Tiene que ser una URL completa (ej: https://...).").optional().or(z.literal("")),
});
export type UpdateClinicWhatsappBridgeInput = z.infer<typeof updateClinicWhatsappBridgeSchema>;
