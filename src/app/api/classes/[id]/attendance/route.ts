import { NextRequest, NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest, hasSchoolAccess } from "@/lib/auth";
import { getOperationalAccessForAuth, subscriptionPastDueResponseForAccess } from "@/lib/subscription-access";
import { isSchoolArchived } from "@/lib/schools";
import { validAttendanceDate, validateAttendanceStudents } from "@/lib/attendance-core";

type Context = { params: Promise<{ id: string }> };
async function access(request: NextRequest, context: Context) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const { auth } = result;
  if (!["super_admin", "admin", "educator"].includes(auth.role)) return { error: NextResponse.json({ error: "Sem permissão para chamada." }, { status: 403 }) };
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return { error: NextResponse.json({ error: "Turma inválida." }, { status: 400 }) };
  const db = (await clientPromise).db("supera_pontos");
  const classData = await db.collection("classes").findOne({ _id: new ObjectId(id) });
  if (!classData) return { error: NextResponse.json({ error: "Turma não encontrada." }, { status: 404 }) };
  const schoolId = new ObjectId(String(classData.schoolId));
  if (!hasSchoolAccess(auth, schoolId) || (auth.role === "super_admin" && request.nextUrl.searchParams.get("schoolId") !== String(schoolId))) return { error: NextResponse.json({ error: "Selecione a unidade autorizada." }, { status: 403 }) };
  const school = await db.collection("schools").findOne({ _id: schoolId });
  if (!school || (auth.role !== "super_admin" && auth.companyId && String(auth.companyId) !== String(school.companyId))) return { error: NextResponse.json({ error: "Unidade não autorizada." }, { status: 403 }) };
  // Educadores registram apenas nas turmas sob sua responsabilidade.
  if (auth.role === "educator" && String(classData.educatorId) !== String(auth.userId)) return { error: NextResponse.json({ error: "Somente o educador responsável pode registrar esta chamada." }, { status: 403 }) };
  return { db, auth, classData, schoolId, school };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const result = await access(request, context);
    if ("error" in result) return result.error;
    const { db, classData, schoolId } = result;
    const date = request.nextUrl.searchParams.get("date");
    const session = request.nextUrl.searchParams.get("session")?.trim();
    if (!validAttendanceDate(date) || !session || session.length > 80) return NextResponse.json({ error: "Informe data válida e identificação da sessão." }, { status: 400 });
    const record = await db.collection("attendanceSessions").findOne({ schoolId, classId: classData._id, date, session });
    if (record) return NextResponse.json({ record });
    const studentIds = (Array.isArray(classData.studentIds) ? classData.studentIds : []).map((id: unknown) => String(id)).filter((id: string) => ObjectId.isValid(id));
    const students = await db.collection("users").find({ _id: { $in: studentIds.map((id: string) => new ObjectId(id)) }, role: "student", schoolId: { $in: [schoolId, String(schoolId)] }, active: { $ne: false } }).project({ name: 1, companyId: 1 }).sort({ name: 1 }).toArray();
    return NextResponse.json({ record: null, students: students.filter((student) => !student.companyId || String(student.companyId) === String(result.school.companyId)).map((student) => ({ studentId: String(student._id), studentName: String(student.name), present: false })) });
  } catch (error) { console.error("Erro ao consultar chamada", error); return NextResponse.json({ error: "Não foi possível consultar a chamada." }, { status: 500 }); }
}

async function save(request: NextRequest, context: Context, correction: boolean) {
  try {
    const result = await access(request, context);
    if ("error" in result) return result.error;
    const { db, auth, classData, schoolId, school } = result;
    const operational = await getOperationalAccessForAuth(db, auth);
    if (!operational.canPerformOperationalMutation) return NextResponse.json(subscriptionPastDueResponseForAccess(operational), { status: 403 });
    if (isSchoolArchived(school) || school.active === false || classData.active === false) return NextResponse.json({ error: "Turma ou unidade inativa." }, { status: 409 });
    const body = await request.json();
    const session = typeof body.session === "string" ? body.session.trim() : "";
    if (!validAttendanceDate(body.date) || !session || session.length > 80) return NextResponse.json({ error: "Informe data válida e identificação da sessão." }, { status: 400 });
    const collection = db.collection("attendanceSessions");
    await collection.createIndex({ schoolId: 1, classId: 1, date: 1, session: 1 }, { unique: true, name: "attendance_session_identity" });
    const filter = { schoolId, classId: classData._id, date: body.date, session };
    const existing = await collection.findOne(filter);
    if (!!existing !== correction) return NextResponse.json({ error: existing ? "Chamada já registrada. Consulte para corrigir." : "Chamada não encontrada." }, { status: 409 });
    let expected: Array<{ studentId: string; studentName: string }>;
    if (existing) {
      expected = existing.students;
      if (!Number.isInteger(body.version) || body.version !== existing.version || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500) return NextResponse.json({ error: "Informe motivo da correção e recarregue a versão atual." }, { status: 409 });
    } else {
      const ids = (Array.isArray(classData.studentIds) ? classData.studentIds : []).map((id: unknown) => String(id)).filter((id: string) => ObjectId.isValid(id));
      const students = await db.collection("users").find({ _id: { $in: ids.map((id: string) => new ObjectId(id)) }, role: "student", schoolId: { $in: [schoolId, String(schoolId)] }, active: { $ne: false } }).project({ name: 1, companyId: 1 }).toArray();
      expected = students.filter((student) => !student.companyId || String(student.companyId) === String(school.companyId)).map((student) => ({ studentId: String(student._id), studentName: String(student.name) }));
    }
    if (!expected.length || !validateAttendanceStudents(expected.map((student) => student.studentId), body.students)) return NextResponse.json({ error: "A chamada deve conter exatamente os alunos esperados. Recarregue a turma." }, { status: 400 });
    const entries = body.students as Array<{ studentId: string; present: boolean }>;
    const students = expected.map((student) => ({ ...student, present: entries.find((item) => item.studentId === student.studentId)!.present }));
    const now = new Date();
    if (existing) {
      const updated = await collection.updateOne({ ...filter, version: body.version }, { $set: { students, updatedAt: now, audit: [...existing.audit, { actorId: auth.userId, at: now, reason: body.reason.trim(), before: existing.students, after: students }] }, $inc: { version: 1 } });
      if (!updated.modifiedCount) return NextResponse.json({ error: "Outra pessoa alterou esta chamada. Recarregue." }, { status: 409 });
    } else {
      const category = await db.collection("categories").findOne({ attendanceSchoolKey: String(schoolId), isAttendance: true, active: { $ne: false } });
      await collection.insertOne({ ...filter, companyId: school.companyId ?? null, className: String(classData.name), categoryId: category?._id ?? null, students, version: 1, createdAt: now, updatedAt: now, createdBy: auth.userId, audit: [{ actorId: auth.userId, at: now, reason: "Registro inicial", after: students }] });
    }
    return NextResponse.json({ message: "Chamada salva. Nenhum ponto foi lançado." });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Dados enviados em formato inválido." }, { status: 400 });
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "Chamada já registrada." }, { status: 409 });
    console.error("Erro ao salvar chamada", error); return NextResponse.json({ error: "Não foi possível salvar a chamada." }, { status: 500 });
  }
}
export const POST = (request: NextRequest, context: Context) => save(request, context, false);
export const PATCH = (request: NextRequest, context: Context) => save(request, context, true);
