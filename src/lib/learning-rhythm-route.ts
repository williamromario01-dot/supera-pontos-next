import { ObjectId, type Db, type Document } from "mongodb";
import type { NextRequest } from "next/server";
import type { AuthenticatedUser } from "./auth";
import { getSchoolObjectId, hasCompanySchoolAccess } from "./auth";

export const DB_NAME = "supera_pontos";
export const variants = (id: ObjectId) => [id, id.toHexString()];

export async function resolveLearningScope(request: NextRequest, auth: AuthenticatedUser, db: Db) {
  const requested = getSchoolObjectId(request.nextUrl.searchParams.get("schoolId"));
  const schoolId = auth.role === "super_admin" || auth.role === "company_admin" ? requested : auth.schoolId;
  if (!schoolId || !(await hasCompanySchoolAccess(auth, schoolId))) return null;
  const school = await db.collection("schools").findOne({ _id: schoolId, active: { $ne: false }, status: { $ne: "archived" } });
  if (!school) return null;
  const companyId = school.companyId instanceof ObjectId ? school.companyId : auth.companyId;
  return companyId ? { schoolId, companyId } : null;
}
export function positiveInteger(value: unknown, maximum = 1_000_000) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}
export function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null;
}
export function objectId(value: unknown) { return ObjectId.isValid(String(value)) ? new ObjectId(String(value)) : null; }
export function serialize(document: Document) {
  return Object.fromEntries(Object.entries(document).map(([key, value]) => [key === "_id" ? "id" : key, value instanceof ObjectId ? value.toHexString() : value]));
}
