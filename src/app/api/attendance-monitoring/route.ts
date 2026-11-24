import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { resolveWeeklyReportSchool } from "@/lib/weekly-management-report-access";
import { buildFrequencyMonitoring, validFrequencyConfiguration, type FrequencyConfiguration } from "@/lib/attendance-monitoring";
import type { AttendanceSession } from "@/lib/attendance-core";

const DB_NAME = "supera_pontos";
const variants = (id: ObjectId) => [id, id.toString()];

async function context(request: NextRequest) {
  const authenticated = await authenticateRequest(request);
  if (!authenticated.authenticated) return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const access = resolveWeeklyReportSchool(authenticated.auth, request.nextUrl.searchParams.get("schoolId"));
  if (!access.allowed) return { response: NextResponse.json({ error: access.error }, { status: access.status }) };
  const db = (await clientPromise).db(DB_NAME);
  const school = await db.collection("schools").findOne({ _id: access.schoolId });
  if (!school) return { response: NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 }) };
  return { db, school, schoolId: access.schoolId, auth: authenticated.auth };
}

export async function GET(request: NextRequest) {
  try {
    const result = await context(request); if ("response" in result) return result.response;
    const requestedYear = Number(request.nextUrl.searchParams.get("year") || new Date().getFullYear());
    if (!Number.isInteger(requestedYear) || requestedYear < 2000 || requestedYear > 2200) return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
    const configurations = (Array.isArray(result.school.frequencyConfigurations) ? result.school.frequencyConfigurations : []) as FrequencyConfiguration[];
    const configuration = configurations.find((item) => item.year === requestedYear) || null;
    if (!configuration) return NextResponse.json({ configuration: null, report: null, message: "Configure a frequência para este ano." }, { headers: { "Cache-Control": "no-store" } });
    const [sessions, classes, students] = await Promise.all([
      result.db.collection("attendanceSessions").find({ schoolId: { $in: variants(result.schoolId) }, date: { $gte: `${requestedYear}-01-01`, $lte: `${requestedYear}-12-31` }, $or: [{ status: "FINALIZED" }, { status: { $exists: false } }] }).project({ classId: 1, className: 1, date: 1, session: 1, students: 1, responsibleEducatorId: 1, responsibleEducatorName: 1 }).toArray(),
      result.db.collection("classes").find({ schoolId: { $in: variants(result.schoolId) } }).project({ name: 1, studentIds: 1, classType: 1 }).toArray(),
      result.db.collection("users").find({ schoolId: { $in: variants(result.schoolId) }, role: "student" }).project({ name: 1, enrollmentDate: 1, enrolledAt: 1, admissionDate: 1 }).sort({ name: 1 }).toArray(),
    ]);
    const report = buildFrequencyMonitoring({
      configuration, sessions: sessions.map((item) => ({ ...item, classId: String(item.classId) })) as unknown as AttendanceSession[],
      classes: classes.map((item) => ({ id: String(item._id), name: String(item.name || "Turma"), classType: item.classType, studentIds: (item.studentIds || []).map(String) })),
      students: students.map((item) => ({ id: String(item._id), name: String(item.name || "Aluno"), enrollmentDate: item.enrollmentDate || item.enrolledAt || item.admissionDate })),
    });
    return NextResponse.json({ configuration, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Erro no acompanhamento de frequência", error); return NextResponse.json({ error: "Não foi possível carregar o acompanhamento de frequência." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await context(request); if ("response" in result) return result.response;
    const body = await request.json();
    if (!validFrequencyConfiguration(body)) return NextResponse.json({ error: "Configuração anual de frequência inválida." }, { status: 400 });
    const configurations = (Array.isArray(result.school.frequencyConfigurations) ? result.school.frequencyConfigurations : []) as FrequencyConfiguration[];
    const before = configurations.find((item) => item.year === body.year) || null;
    const now = new Date();
    const configuration = { year: body.year, modality: body.modality, expectedAnnualLessons: body.expectedAnnualLessons, maximumAbsencePercentage: body.maximumAbsencePercentage, updatedAt: now, updatedBy: result.auth.userId, updatedByName: String(result.auth.user.name || "Administrador") };
    const next = [...configurations.filter((item) => item.year !== body.year), configuration].sort((a, b) => a.year - b.year);
    await result.db.collection("schools").updateOne({ _id: result.schoolId }, { $set: { frequencyConfigurations: next, updatedAt: now } });
    await result.db.collection("frequencyConfigurationAudit").insertOne({ schoolId: result.schoolId, companyId: result.school.companyId || null, year: body.year, before, after: configuration, actorId: result.auth.userId, actorName: configuration.updatedByName, createdAt: now });
    return NextResponse.json({ configuration, message: "Configuração anual de frequência salva." });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    console.error("Erro ao configurar frequência", error); return NextResponse.json({ error: "Não foi possível salvar a configuração de frequência." }, { status: 500 });
  }
}
