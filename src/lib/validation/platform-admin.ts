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
