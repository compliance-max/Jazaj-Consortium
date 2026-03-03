import { UserRole } from "@prisma/client";

export const ADMIN_ROLES: UserRole[] = ["CTPA_ADMIN", "CTPA_MANAGER"];
export const PORTAL_ROLES: UserRole[] = ["EMPLOYER_DER"];

export function isAdminRole(role: UserRole) {
  return ADMIN_ROLES.includes(role);
}

export function isPortalRole(role: UserRole) {
  return PORTAL_ROLES.includes(role);
}
