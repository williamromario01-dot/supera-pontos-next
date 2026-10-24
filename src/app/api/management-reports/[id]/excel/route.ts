import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { resolveWeeklyReportSchool } from "@/lib/weekly-management-report-access";
import { addCivilDays } from "@/lib/weekly-management-report-core";
import {
  generateWeeklyManagementReportExcel,
  InvalidWeeklyReportSnapshotError,
  UnsupportedWeeklyReportVersionError,
  weeklyReportExcelFilename,
} from "@/lib/weekly-management-report-excel";
import type { WeeklyReport } from "@/lib/weekly-management-report-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DB_NAME = "supera_pontos";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const access = resolveWeeklyReportSchool(result.auth, request.nextUrl.searchParams.get("schoolId"));
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!id || id.length > 100) return NextResponse.json({ error: "Relatório inválido." }, { status: 400 });

  try {
    const reports = (await clientPromise).db(DB_NAME).collection<Document & { _id: string; schoolId: ObjectId }>("weeklyReports");
    const report = await reports.findOne({ _id: id, schoolId: access.schoolId, status: "CLOSED" });
    if (!report) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
    const previous = typeof report.weekStart === "string" ? await reports.findOne({ schoolId: access.schoolId, weekStart: addCivilDays(report.weekStart, -7), status: "CLOSED" }) : null;
    const typedReport = report as unknown as WeeklyReport;
    const buffer = await generateWeeklyManagementReportExcel({ report: typedReport, previous: previous as unknown as WeeklyReport | null });
    const filename = weeklyReportExcelFilename(typedReport);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof UnsupportedWeeklyReportVersionError || error instanceof InvalidWeeklyReportSnapshotError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("Falha ao gerar Excel do relatório semanal de gestão.");
    return NextResponse.json({ error: "Não foi possível gerar o arquivo Excel." }, { status: 500 });
  }
}
