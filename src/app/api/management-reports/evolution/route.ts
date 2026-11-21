import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest, getSchoolObjectId, hasCompanySchoolAccess } from "@/lib/auth";
import { buildPedagogicalEvolution, PEDAGOGICAL_HISTORY_WEEKS, type AttentionStatus } from "@/lib/pedagogical-evolution";
import type { WeeklyReport } from "@/lib/weekly-management-report-types";

const DB_NAME = "supera_pontos";
const MANAGER_ROLES = new Set(["super_admin", "company_admin", "admin"]);
const SITUATIONS = new Set<AttentionStatus | "ALL">(["ALL", "EVOLUTION", "STABLE", "PREVENTIVE_ATTENTION", "PRIORITY_ATTENTION", "INDIVIDUAL_FOLLOW_UP", "RECOVERING", "INSUFFICIENT_DATA"]);

export async function GET(request: NextRequest) {
  const authenticated = await authenticateRequest(request);
  if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const auth = authenticated.auth;
  if (!MANAGER_ROLES.has(auth.role) && auth.role !== "educator") return NextResponse.json({ error: "Perfil sem acesso aos indicadores pedagógicos." }, { status: 403 });

  const requestedSchoolId = getSchoolObjectId(request.nextUrl.searchParams.get("schoolId"));
  const schoolId = auth.role === "admin" || auth.role === "educator" ? auth.schoolId : requestedSchoolId;
  if (!schoolId || !(await hasCompanySchoolAccess(auth, schoolId))) return NextResponse.json({ error: "Escola não autorizada." }, { status: 403 });
  if (requestedSchoolId && String(requestedSchoolId) !== String(schoolId)) return NextResponse.json({ error: "Escola não autorizada." }, { status: 403 });

  const db = (await clientPromise).db(DB_NAME);
  const selectedId = request.nextUrl.searchParams.get("reportId");
  const reportCollection = db.collection<Document & { _id: string; schoolId: ObjectId }>("weeklyReports");
  const selected = selectedId
    ? await reportCollection.findOne({ _id: selectedId, schoolId, status: "CLOSED" })
    : await reportCollection.find({ schoolId, status: "CLOSED" }).sort({ weekStart: -1 }).limit(1).next();
  if (!selected) return NextResponse.json({ analytics: null }, { headers: { "Cache-Control": "no-store" } });

  const reports = await reportCollection.find(
    { schoolId, status: "CLOSED", weekStart: { $lte: selected.weekStart } },
    { projection: { companyName: 1, schoolName: 1, weekStart: 1, weekEnd: 1, closedAt: 1, status: 1, reportVersion: 1, generatedBy: 1, timezone: 1, scoringMode: 1, summary: 1, studentMetrics: 1, categoryMetrics: 1, educatorMetrics: 1, classMetrics: 1 } },
  ).sort({ weekStart: -1 }).limit(PEDAGOGICAL_HISTORY_WEEKS).toArray() as unknown as WeeklyReport[];

  const requestedSituation = request.nextUrl.searchParams.get("situation") as AttentionStatus | "ALL" | null;
  const educatorId = auth.role === "educator" ? String(auth.userId) : request.nextUrl.searchParams.get("educatorId") || undefined;
  const analytics = buildPedagogicalEvolution(reports, {
    educatorId,
    classId: request.nextUrl.searchParams.get("classId") || undefined,
    categoryId: request.nextUrl.searchParams.get("categoryId") || undefined,
    search: request.nextUrl.searchParams.get("search") || undefined,
    situation: requestedSituation && SITUATIONS.has(requestedSituation) ? requestedSituation : "ALL",
  });

  if (analytics && auth.role === "educator") {
    analytics.filters.educators = analytics.filters.educators.filter((item) => item.id === educatorId);
    analytics.filters.classes = analytics.filters.classes.filter((item) => item.educatorId === educatorId);
    analytics.educators = analytics.educators.filter((item) => item.id === educatorId);
  }

  return NextResponse.json({ analytics, permissions: { nominalEducatorComparison: MANAGER_ROLES.has(auth.role), ownStudentsOnly: auth.role === "educator" } }, { headers: { "Cache-Control": "private, no-store" } });
}
