import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { resolveWeeklyReportSchool } from "@/lib/weekly-management-report-access";

const DB_NAME = "supera_pontos";

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const access = resolveWeeklyReportSchool(result.auth, request.nextUrl.searchParams.get("schoolId"));
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const reports = await (await clientPromise).db(DB_NAME).collection("weeklyReports").find(
    { schoolId: access.schoolId, status: "CLOSED" },
    { projection: { weekStart: 1, weekEnd: 1, closedAt: 1, status: 1, reportVersion: 1 } },
  ).sort({ weekStart: -1 }).limit(104).toArray();
  return NextResponse.json({ reports: reports.map((report) => ({ reportId: String(report._id), weekStart: report.weekStart, weekEnd: report.weekEnd, closedAt: report.closedAt, status: report.status, reportVersion: report.reportVersion })) }, { headers: { "Cache-Control": "no-store" } });
}
