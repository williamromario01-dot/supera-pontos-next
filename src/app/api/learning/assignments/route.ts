import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { LEARNING_COLLECTIONS } from "@/lib/learning-rhythm-model";
import { calculateLearningRhythm, studentLearningMessage } from "@/lib/learning-rhythm";
import { DB_NAME, objectId, resolveLearningScope, serialize, variants } from "@/lib/learning-rhythm-route";

const validDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const validDays = (value: unknown): value is number[] => Array.isArray(value) && value.length > 0 && value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role === "company_admin") return NextResponse.json({ error: "Perfil sem acesso pedagógico." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME); const scope = await resolveLearningScope(request, result.auth, db);
  if (!scope) return NextResponse.json({ error: "Escola inválida ou não autorizada." }, { status: 403 });
  const filter: Record<string, unknown> = { schoolId: scope.schoolId, active: { $ne: false } };
  if (result.auth.role === "student") filter.studentId = result.auth.userId;
  if (result.auth.role === "educator") {
    const classes = await db.collection("classes").find({ schoolId: { $in: variants(scope.schoolId) }, educatorId: { $in: variants(result.auth.userId) }, active: { $ne: false } }, { projection: { studentIds: 1 } }).toArray();
    filter.studentId = { $in: classes.flatMap((item) => item.studentIds ?? []).map((id) => objectId(id)).filter(Boolean) };
  }
  const assignments = await db.collection(LEARNING_COLLECTIONS.assignments).find(filter).sort({ startDate: 1 }).toArray();
  const ids = (key: string) => assignments.map((item) => item[key]).filter((id): id is ObjectId => id instanceof ObjectId);
  const [books, students] = await Promise.all([
    db.collection(LEARNING_COLLECTIONS.books).find({ _id: { $in: ids("bookId") }, schoolId: scope.schoolId }).toArray(),
    db.collection("users").find({ _id: { $in: ids("studentId") }, schoolId: { $in: variants(scope.schoolId) } }, { projection: { name: 1, className: 1 } }).toArray(),
  ]);
  const bookMap = new Map(books.map((book) => [String(book._id), book])); const studentMap = new Map(students.map((student) => [String(student._id), student]));
  const asOf = request.nextUrl.searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
  const rows = assignments.flatMap((assignment) => {
    const book = bookMap.get(String(assignment.bookId)); const student = studentMap.get(String(assignment.studentId)); if (!book || !student) return [];
    const metrics = calculateLearningRhythm({ startDate: assignment.startDate, totalQuestions: book.totalQuestions, completedQuestions: assignment.completedQuestions ?? 0, studyDaysPerWeek: assignment.studyDaysPerWeek, pauses: assignment.pauses ?? [], asOf });
    const common = { ...serialize(assignment), id: String(assignment._id), studentId: String(assignment.studentId), bookId: String(assignment.bookId), categoryId: String(assignment.categoryId), bookName: book.name, totalQuestions: book.totalQuestions, totalPages: book.totalPages, studentName: student.name, className: student.className ?? "", metrics };
    return [result.auth.role === "student" ? { id: common.id, bookName: common.bookName, progressPercentage: metrics.progressPercentage, completedQuestions: assignment.completedQuestions, totalQuestions: book.totalQuestions, suggestion: studentLearningMessage(metrics) } : common];
  });
  return NextResponse.json({ assignments: rows });
}

export async function POST(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!['admin','educator','super_admin'].includes(result.auth.role)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME); const scope = await resolveLearningScope(request, result.auth, db);
  if (!scope) return NextResponse.json({ error: "Escola inválida ou não autorizada." }, { status: 403 });
  const body = await request.json(); const studentId = objectId(body.studentId); const bookId = objectId(body.bookId);
  if (!studentId || !bookId || !validDate(body.startDate) || !validDays(body.studyDaysPerWeek)) return NextResponse.json({ error: "Aluno, livro, início e dias de estudo são obrigatórios." }, { status: 400 });
  const [student, book] = await Promise.all([
    db.collection("users").findOne({ _id: studentId, schoolId: { $in: variants(scope.schoolId) }, role: "student", active: { $ne: false } }),
    db.collection(LEARNING_COLLECTIONS.books).findOne({ _id: bookId, schoolId: scope.schoolId, active: true }),
  ]);
  if (!student || !book) return NextResponse.json({ error: "Aluno ou livro não pertence à escola." }, { status: 400 });
  if (result.auth.role === "educator") {
    const allowed = await db.collection("classes").findOne({ schoolId: { $in: variants(scope.schoolId) }, educatorId: { $in: variants(result.auth.userId) }, studentIds: { $in: variants(studentId) }, active: { $ne: false } });
    if (!allowed) return NextResponse.json({ error: "Aluno fora das turmas autorizadas." }, { status: 403 });
  }
  const duplicate = await db.collection(LEARNING_COLLECTIONS.assignments).findOne({ schoolId: scope.schoolId, studentId, bookId, active: { $ne: false } });
  if (duplicate) return NextResponse.json({ error: "Este livro já está vinculado ao aluno." }, { status: 409 });
  const now = new Date(); const assignment = { _id: new ObjectId(), ...scope, studentId, bookId, categoryId: book.categoryId, startDate: body.startDate, completedQuestions: 0, lastValidActivityAt: null, studyDaysPerWeek: [...new Set(body.studyDaysPerWeek)].sort(), pauses: [], completionDate: null, active: true, createdAt: now, updatedAt: now };
  await db.collection(LEARNING_COLLECTIONS.assignments).insertOne(assignment);
  return NextResponse.json({ assignment: serialize(assignment) }, { status: 201 });
}
