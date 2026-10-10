
import type { NextRequest } from "next/server";
import {
  ObjectId,
  type Document,
  type WithId,
} from "mongodb";
import clientPromise from "@/lib/mongodb";
import type { UserRole } from "@/lib/types";

const DB_NAME = "supera_pontos";

export const SESSION_COOKIE_NAME = "supera_session";

const USER_ROLES: readonly UserRole[] = [
  "super_admin",
  "admin",
  "educator",
  "student",
];

type RequestWithCookies = Pick<NextRequest, "cookies">;

export type AuthFailureReason =
  | "missing_session"
  | "invalid_session"
  | "expired_session"
  | "missing_user"
  | "inactive_user"
  | "invalid_role";

export interface AuthenticatedUser {
  user: WithId<Document>;
  userId: ObjectId;
  role: UserRole;
  schoolId: ObjectId | null;
}

export type AuthResult =
  | { authenticated: true; auth: AuthenticatedUser }
  | { authenticated: false; reason: AuthFailureReason };

export class AuthInfrastructureError extends Error {
  constructor() {
    super("Authentication infrastructure unavailable.");
    this.name = "AuthInfrastructureError";
  }
}

function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    USER_ROLES.includes(value as UserRole)
  );
}

export function getSchoolObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }

  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

function getUserObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }

  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

function isExpired(expiresAt: unknown): boolean {
  if (!(expiresAt instanceof Date)) {
    return true;
  }

  return expiresAt.getTime() <= Date.now();
}

export async function authenticateRequest(
  request: RequestWithCookies
): Promise<AuthResult> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return { authenticated: false, reason: "missing_session" };
  }

  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const session = await db.collection("sessions").findOne({ token });

    if (!session) {
      return { authenticated: false, reason: "invalid_session" };
    }

    if (isExpired(session.expiresAt)) {
      return { authenticated: false, reason: "expired_session" };
    }

    const userId = getUserObjectId(session.userId);

    if (!userId) {
      return { authenticated: false, reason: "invalid_session" };
    }

    const user = await db.collection("users").findOne({ _id: userId });

    if (!user) {
      return { authenticated: false, reason: "missing_user" };
    }

    // Preserva a convenção atual: somente active === false significa inativo.
    if (user.active === false) {
      return { authenticated: false, reason: "inactive_user" };
    }

    if (!isUserRole(user.role)) {
      return { authenticated: false, reason: "invalid_role" };
    }

    return {
      authenticated: true,
      auth: {
        user,
        userId,
        role: user.role,
        schoolId: getSchoolObjectId(user.schoolId),
      },
    };
  } catch {
    throw new AuthInfrastructureError();
  }
}

export async function getAuthenticatedUser(
  request: RequestWithCookies
): Promise<AuthenticatedUser | null> {
  const result = await authenticateRequest(request);

  return result.authenticated ? result.auth : null;
}

export function hasRequiredRole(
  auth: AuthenticatedUser,
  allowedRoles: readonly UserRole[]
): boolean {
  return allowedRoles.includes(auth.role);
}

export function hasGlobalSchoolAccess(
  auth: AuthenticatedUser
): boolean {
  return auth.role === "super_admin";
}

/**
 * Verifica se a escola existe. Não concede autorização de acesso por si só.
 */
export async function schoolExists(
  schoolId: unknown
): Promise<boolean> {
  const normalizedSchoolId = getSchoolObjectId(schoolId);

  if (!normalizedSchoolId) {
    return false;
  }

  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const school = await db.collection("schools").findOne(
      { _id: normalizedSchoolId },
      { projection: { _id: 1 } }
    );

    return Boolean(school);
  } catch {
    throw new AuthInfrastructureError();
  }
}

/**
 * Verifica o formato do ID e a autorização por escola.
 * A existência da escola deve ser validada separadamente quando necessária.
 */
export function hasSchoolAccess(
  auth: AuthenticatedUser,
  targetSchoolId: unknown
): boolean {
  const normalizedTargetSchoolId = getSchoolObjectId(targetSchoolId);

  if (!normalizedTargetSchoolId) {
    return false;
  }

  if (hasGlobalSchoolAccess(auth)) {
    return true;
  }

  if (!auth.schoolId) {
    return false;
  }

  return auth.schoolId.equals(normalizedTargetSchoolId);
}
