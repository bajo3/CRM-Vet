import type { Role } from "@prisma/client";
export const CLIENT_MANAGE_ROLES: Role[] = ["OWNER", "ADMIN", "RECEPTIONIST"];
export const AGENDA_MANAGE_ROLES: Role[] = ["OWNER", "ADMIN", "RECEPTIONIST"];
export const CLINIC_CONFIG_ROLES: Role[] = ["OWNER", "ADMIN"];
/**
 * La gestión de usuarios (alta, cambio de rol, activar/desactivar) queda reservada a OWNER.
 * Decisión de producto: el spec le da explícitamente a OWNER la administración de usuarios; ADMIN
 * puede editar la clínica y horarios (CLINIC_CONFIG_ROLES) pero no da ni quita accesos al equipo.
 */
export const TEAM_MANAGE_ROLES: Role[] = ["OWNER"];
export const ALL_ROLES: Role[] = ["OWNER", "ADMIN", "VETERINARIAN", "RECEPTIONIST"];
