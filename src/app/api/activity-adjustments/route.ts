import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest, getSchoolObjectId } from "@/lib/auth";
import { listActivityAdjustmentPendencies } from "@/lib/activity-adjustment-service";
import { activitySubmissionsEnabled } from "@/lib/activity-submission-service";

export async function GET(request: NextRequest) {
  if (!activitySubmissionsEnabled()) return NextResponse.json({ error: "Recurso não disponível." }, { status: 404 });
  const authenticated = await authenticateRequest(request);
  if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const auth = authenticated.auth;
  if (auth.role !== "admin" && auth.role !== "super_admin") return NextResponse.json({ error: "Perfil sem permissão." }, { status: 403 });
  const schoolId = auth.role === "super_admin" ? getSchoolObjectId(request.nextUrl.searchParams.get("schoolId")) : auth.schoolId;
  if (!schoolId) return NextResponse.json({ error: "Selecione uma escola válida." }, { status: 400 });
  const db = (await clientPromise).db("supera_pontos");
  const school = await db.collection("schools").findOne({ _id: schoolId }, { projection: { companyId: 1 } });
  if (!school || (auth.role !== "super_admin" && String(school.companyId) !== String(auth.companyId))) return NextResponse.json({ error: "Escola não encontrada." }, { status: 404 });
  const rows = await listActivityAdjustmentPendencies(db, schoolId);
  return NextResponse.json({ pendencies: rows.map((row) => ({ ...row, _id: String(row._id), companyId: String(row.companyId), schoolId: String(row.schoolId), studentId: String(row.studentId), categoryId: String(row.categoryId), activityRecordId: String(row.activityRecordId), weeklyScoreLedgerId: String(row.weeklyScoreLedgerId), requestedBy: String(row.requestedBy), resolvedBy: row.resolvedBy ? String(row.resolvedBy) : null })) });
}
