"use server";

import { headers } from "next/headers";
import { getPrisma } from "../prisma";
import { hashPassword } from "../auth/password";
import { createSession } from "../auth/session";
import { checkRateLimit, clientIpFromHeaders } from "../rate-limit";
import { registerClinicSchema, type RegisterClinicInput } from "../validation/clinic-registration";
import type { ActionResult } from "./types";

const DEFAULT_OPENING_HOURS = {
  monday: [["09:00", "18:00"]],
  tuesday: [["09:00", "18:00"]],
  wednesday: [["09:00", "18:00"]],
  thursday: [["09:00", "18:00"]],
  friday: [["09:00", "18:00"]],
};

function isUniqueEmailViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

export type RegisterClinicResult = ActionResult;

/**
 * Alta pública y autoservicio de una clínica nueva: crea la clínica ya activa (APPROVED) junto con su
 * primer usuario (rol OWNER) y le abre la sesión, sin intervención del superadmin. El superadmin
 * igual puede suspender una clínica después desde /admin/clinicas (`REJECTED` bloquea el login).
 */
export async function registerClinic(input: RegisterClinicInput): Promise<RegisterClinicResult> {
  const requestHeaders = await headers();
  const ip = clientIpFromHeaders(requestHeaders);
  const rateLimit = checkRateLimit(`register-clinic:${ip}`, 5, 10 * 60_000);
  if (!rateLimit.allowed) {
    return { ok: false, message: "Demasiados intentos. Probá de nuevo en unos minutos." };
  }

  const parsed = registerClinicSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Revisá los datos ingresados.", fieldErrors };
  }

  const prisma = getPrisma();
  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      ok: false,
      message: "Ese correo ya está registrado. Si ya tenés cuenta, iniciá sesión.",
      fieldErrors: { email: "Ese correo ya está en uso." },
    };
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const clinic = await prisma.clinic.create({
      data: {
        name: parsed.data.clinicName,
        phone: parsed.data.clinicPhone || null,
        status: "APPROVED",
        openingHours: DEFAULT_OPENING_HOURS,
        members: {
          create: {
            role: "OWNER",
            active: true,
            user: { create: { name: parsed.data.name, email, passwordHash } },
          },
        },
      },
      select: { id: true, members: { select: { userId: true } } },
    });
    await createSession({ userId: clinic.members[0].userId, clinicId: clinic.id, role: "OWNER", name: parsed.data.name });
    return { ok: true };
  } catch (error) {
    if (isUniqueEmailViolation(error)) {
      return { ok: false, message: "Ese correo ya está en uso.", fieldErrors: { email: "Ese correo ya está registrado." } };
    }
    throw error;
  }
}
