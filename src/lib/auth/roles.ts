import type { Role } from "@prisma/client";
export const CLIENT_MANAGE_ROLES: Role[] = ["OWNER", "ADMIN", "RECEPTIONIST"];
export const AGENDA_MANAGE_ROLES: Role[] = ["OWNER", "ADMIN", "RECEPTIONIST"];
export const CLINIC_CONFIG_ROLES: Role[] = ["OWNER", "ADMIN"];
