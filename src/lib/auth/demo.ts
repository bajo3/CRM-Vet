import { getPrisma } from "../prisma";
import type { ActionFailure } from "../actions/types";

export const DEMO_BLOCKED: ActionFailure = {
  ok: false,
  message: "Esta acción está deshabilitada en la cuenta demo. Registrá tu clínica para usarla.",
};

/**
 * `true` si la clínica es la demo pública. Cualquiera entra ahí como dueña con el botón del login,
 * así que las acciones que afectan el acceso (contraseñas, equipo) o conectan servicios externos
 * (WhatsApp) deben consultar esto antes de ejecutar.
 */
export async function isDemoClinic(clinicId: string): Promise<boolean> {
  if (!clinicId) return false;
  const clinic = await getPrisma().clinic.findUnique({ where: { id: clinicId }, select: { isDemo: true } });
  return clinic?.isDemo ?? false;
}
