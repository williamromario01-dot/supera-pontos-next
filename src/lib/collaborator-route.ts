import { ObjectId, type Db } from "mongodb";
import type { NextRequest } from "next/server";
import type { AuthenticatedUser } from "./auth";
import { getSchoolObjectId, hasCompanySchoolAccess } from "./auth";

export const COLLABORATOR_DB = "supera_pontos";
export const oid = (value: unknown) => ObjectId.isValid(String(value)) ? new ObjectId(String(value)) : null;
export const idVariants = (id: ObjectId) => [id, id.toHexString()];
export async function collaboratorScope(request: NextRequest, auth: AuthenticatedUser, db: Db, bodySchoolId?: unknown) {
  const requested = getSchoolObjectId(bodySchoolId ?? request.nextUrl.searchParams.get("schoolId"));
  const schoolId = auth.role === "super_admin" || auth.role === "company_admin" ? requested : auth.schoolId;
  if (!schoolId || !(await hasCompanySchoolAccess(auth, schoolId))) return null;
  const school = await db.collection("schools").findOne({ _id: schoolId, active: { $ne: false }, status: { $ne: "archived" } });
  if (!school) return null;
  const companyId = oid(school.companyId) ?? auth.companyId;
  return companyId ? { schoolId, companyId } : null;
}
