import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, { error: "Ingresá tu correo." }).email({ error: "Ingresá un correo válido." }),
  password: z.string().min(1, { error: "Ingresá tu contraseña." }),
});

export type LoginInput = z.infer<typeof loginSchema>;
