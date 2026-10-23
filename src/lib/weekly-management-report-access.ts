import { ObjectId } from "mongodb";
import type { AuthenticatedUser } from "@/lib/auth";

export type ReportAccessResult =
  | { allowed: true; schoolId: ObjectId }
  | { allowed: false; status: 400 | 403; error: string };

export function resolveWeeklyReportSchool(auth: AuthenticatedUser, requestedSchoolId: string | null): ReportAccessResult {
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    return { allowed: false, status: 403, error: "Este perfil não pode acessar relatórios gerenciais." };
  }
  if (auth.role === "admin") {
    if (!auth.schoolId) return { allowed: false, status: 403, error: "Administrador sem escola vinculada." };
    if (requestedSchoolId && requestedSchoolId !== auth.schoolId.toString()) return { allowed: false, status: 403, error: "Acesso permitido somente à própria escola." };
    return { allowed: true, schoolId: auth.schoolId };
  }
  if (!requestedSchoolId || !ObjectId.isValid(requestedSchoolId)) {
    return { allowed: false, status: 400, error: "O super administrador deve informar um schoolId válido." };
  }
  return { allowed: true, schoolId: new ObjectId(requestedSchoolId) };
}
