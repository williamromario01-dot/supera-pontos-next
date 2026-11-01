import type { UserRole } from "./types.ts";

type ScopedUser = {
  role: UserRole;
  companyId?: unknown;
  schoolId?: unknown;
};

const MANAGED_ROLES: Partial<Record<UserRole, readonly UserRole[]>> = {
  company_admin: ["admin", "educator", "student"],
  admin: ["educator", "student"],
  educator: ["student"],
};

function sameId(left: unknown, right: unknown): boolean {
  return Boolean(left && right && String(left) === String(right));
}

export function managedRolesFor(role: UserRole): readonly UserRole[] {
  return MANAGED_ROLES[role] ?? [];
}

export function canManageCredentials(executor: ScopedUser, target: ScopedUser): boolean {
  if (target.role === "super_admin") return false;
  if (!managedRolesFor(executor.role).includes(target.role)) return false;
  if (!sameId(executor.companyId, target.companyId)) return false;
  if (executor.role === "company_admin") return true;
  return sameId(executor.schoolId, target.schoolId);
}

export function normalizeCredentialEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidCredentialEmail(value: string): boolean {
  return value.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
