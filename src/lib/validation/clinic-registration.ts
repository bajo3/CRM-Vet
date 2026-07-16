import { z } from "zod";

export const registerClinicSchema = z
  .object({
    clinicName: z.string().trim().min(1, { error: "Ingresá el nombre de la clínica." }).max(120),
    clinicPhone: z.string().trim().max(30).optional().or(z.literal("")),
    name: z.string().trim().min(1, { error: "Ingresá tu nombre y apellido." }).max(120),
    email: z.string().trim().min(1, { error: "Ingresá tu correo." }).email({ error: "Ingresá un correo válido." }),
    password: z.string().min(8, { error: "La contraseña debe tener al menos 8 caracteres." }).max(72),
    confirmPassword: z.string().min(1, { error: "Repetí la contraseña." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export type RegisterClinicInput = z.infer<typeof registerClinicSchema>;
