import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { resolveWeeklyReportSchool } from "@/lib/weekly-management-report-access";

const DB_NAME = "supera_pontos";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const access = resolveWeeklyReportSchool(result.auth, request.nextUrl.searchParams.get("schoolId"));
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!id || id.length > 100) return NextResponse.json({ error: "Relatório inválido." }, { status: 400 });
  const report = await (await clientPromise).db(DB_NAME).collection<Document & { _id: string; schoolId: ObjectId }>("weeklyReports").findOne({ _id: id, schoolId: access.schoolId, status: "CLOSED" });
  if (!report) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
}
