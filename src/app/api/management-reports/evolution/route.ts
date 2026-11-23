import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest, getSchoolObjectId, hasCompanySchoolAccess } from "@/lib/auth";
import { buildPedagogicalEvolution, PEDAGOGICAL_HISTORY_WEEKS, PEDAGOGICAL_MAX_HISTORY_WEEKS, type AttentionStatus } from "@/lib/pedagogical-evolution";
import type { WeeklyReport } from "@/lib/weekly-management-report-types";

const DB_NAME = "supera_pontos";
const MANAGER_ROLES = new Set(["super_admin", "company_admin", "admin"]);
const SITUATIONS = new Set<AttentionStatus | "ALL">(["ALL", "EVOLUTION", "STABLE", "PREVENTIVE_ATTENTION", "PRIORITY_ATTENTION", "INDIVIDUAL_FOLLOW_UP", "RECOVERING", "INSUFFICIENT_DATA"]);
const HISTORY_WINDOWS = new Set([4, 8, 12]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");
  const requestedWeeks = Number(request.nextUrl.searchParams.get("historyWeeks") || PEDAGOGICAL_HISTORY_WEEKS);
  if ((startDate || endDate) && (!startDate || !endDate || !ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || startDate > endDate)) {
    return NextResponse.json({ error: "Intervalo histórico inválido." }, { status: 400 });
  }
  if (startDate && endDate && (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 > 730) {
    return NextResponse.json({ error: "O período personalizado deve ter no máximo 730 dias." }, { status: 400 });
  }
  if (!startDate && !HISTORY_WINDOWS.has(requestedWeeks)) return NextResponse.json({ error: "Período histórico inválido." }, { status: 400 });

  const weekStart: Record<string, string> = { $lte: endDate && endDate < selected.weekStart ? endDate : selected.weekStart };
  if (startDate) weekStart.$gte = startDate;

  const reports = await reportCollection.find(
    { schoolId, status: "CLOSED", weekStart },
    { projection: { companyName: 1, schoolName: 1, weekStart: 1, weekEnd: 1, closedAt: 1, status: 1, reportVersion: 1, generatedBy: 1, timezone: 1, scoringMode: 1, summary: 1, studentMetrics: 1, categoryMetrics: 1, educatorMetrics: 1, classMetrics: 1 } },
  ).sort({ weekStart: -1 }).limit(startDate ? PEDAGOGICAL_MAX_HISTORY_WEEKS : requestedWeeks).toArray() as unknown as WeeklyReport[];

  const requestedSituation = request.nextUrl.searchParams.get("situation") as AttentionStatus | "ALL" | null;
  const educatorId = auth.role === "educator" ? String(auth.userId) : request.nextUrl.searchParams.get("educatorId") || undefined;
  const analytics = buildPedagogicalEvolution(reports, {
    studentId: request.nextUrl.searchParams.get("studentId") || undefined,
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
