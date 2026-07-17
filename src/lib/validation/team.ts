import { z } from "zod";

const ROLES = ["OWNER", "ADMIN", "VETERINARIAN", "RECEPTIONIST"] as const;

export const addTeamMemberSchema = z.object({
  name: z.string().trim().min(1, { error: "Ingresá el nombre y apellido." }).max(120),
  email: z.string().trim().min(1, { error: "Ingresá el correo." }).email({ error: "Ingresá un correo válido." }),
  password: z.string().min(8, { error: "La contraseña debe tener al menos 8 caracteres." }).max(72),
  role: z.enum(ROLES, { error: "Elegí un rol." }),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type AddTeamMemberValues = z.input<typeof addTeamMemberSchema>;

export const changeMemberRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(ROLES, { error: "Elegí un rol." }),
});
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;

export const toggleMemberActiveSchema = z.object({
  memberId: z.string().min(1),
  active: z.boolean(),
});
export type ToggleMemberActiveInput = z.infer<typeof toggleMemberActiveSchema>;

export const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: "Ingresá tu contraseña actual." }).max(72),
  newPassword: z.string().min(8, { error: "La contraseña nueva debe tener al menos 8 caracteres." }).max(72),
});
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;

export const resetMemberPasswordSchema = z.object({
  memberId: z.string().min(1),
  newPassword: z.string().min(8, { error: "La contraseña debe tener al menos 8 caracteres." }).max(72),
});
export type ResetMemberPasswordInput = z.infer<typeof resetMemberPasswordSchema>;

export const updateOwnLicenseNumberSchema = z.object({
  licenseNumber: z.string().trim().max(40, { error: "Máximo 40 caracteres." }),
});
export type UpdateOwnLicenseNumberInput = z.infer<typeof updateOwnLicenseNumberSchema>;
