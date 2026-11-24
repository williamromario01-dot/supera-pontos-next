import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { resolveWeeklyReportSchool } from "@/lib/weekly-management-report-access";
import { calculateLearningRhythm } from "@/lib/learning-rhythm";
import { LEARNING_COLLECTIONS } from "@/lib/learning-rhythm-model";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authenticated = await authenticateRequest(request);
    if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const access = resolveWeeklyReportSchool(authenticated.auth, request.nextUrl.searchParams.get("schoolId"));
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
    const { id } = await params; if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Aluno inválido." }, { status: 400 });
    const studentId = new ObjectId(id); const schoolVariants = [access.schoolId, String(access.schoolId)]; const studentVariants = [studentId, id];
    const db = (await clientPromise).db("supera_pontos");
    const student = await db.collection("users").findOne({ _id: studentId, role: "student", schoolId: { $in: schoolVariants } }, { projection: { name: 1 } });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado nesta unidade." }, { status: 404 });
    const year = Number(request.nextUrl.searchParams.get("year") || new Date().getFullYear());
    const [sessions, assignments, classes] = await Promise.all([
      db.collection("attendanceSessions").find({ schoolId: { $in: schoolVariants }, date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` }, "students.studentId": { $in: studentVariants }, $or: [{ status: "FINALIZED" }, { status: { $exists: false } }] }).sort({ date: 1, session: 1 }).toArray(),
      db.collection(LEARNING_COLLECTIONS.assignments).find({ schoolId: { $in: schoolVariants }, studentId: { $in: studentVariants }, active: { $ne: false } }).sort({ startDate: 1 }).toArray(),
      db.collection("classes").find({ schoolId: { $in: schoolVariants }, studentIds: { $in: studentVariants } }, { projection: { name: 1, educatorId: 1 } }).toArray(),
    ]);
    const bookIds = assignments.flatMap((item) => item.bookId instanceof ObjectId ? [item.bookId] : []); const categoryIds = assignments.flatMap((item) => item.categoryId instanceof ObjectId ? [item.categoryId] : []); const educatorIds = classes.flatMap((item) => item.educatorId instanceof ObjectId ? [item.educatorId] : []);
    const [books, categories, educators] = await Promise.all([
      db.collection(LEARNING_COLLECTIONS.books).find({ _id: { $in: bookIds }, schoolId: access.schoolId }).toArray(),
      db.collection("categories").find({ _id: { $in: categoryIds } }, { projection: { name: 1 } }).toArray(),
      db.collection("users").find({ _id: { $in: educatorIds }, schoolId: { $in: schoolVariants } }, { projection: { name: 1 } }).toArray(),
    ]);
    const bookMap = new Map(books.map((item) => [String(item._id), item])); const categoryMap = new Map(categories.map((item) => [String(item._id), String(item.name)])); const educatorMap = new Map(educators.map((item) => [String(item._id), String(item.name)]));
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const history = sessions.flatMap((row) => { const entry = (row.students || []).find((item: { studentId?: unknown }) => String(item.studentId) === id); if (!entry) return []; return [{ date: row.date, session: row.session, present: Boolean(entry.present), classId: String(row.classId), className: String(row.className || "Turma"), educatorName: row.responsibleEducatorName || row.recordedByEducatorName || null, recordedByName: row.recordedByEducatorName || null, justification: entry.justification || null, audit: (row.audit || []).map((audit: Record<string, unknown>) => ({ at: audit.at, actorName: audit.actorName, reason: audit.reason })) }]; });
    const learning = assignments.flatMap((assignment) => { const book = bookMap.get(String(assignment.bookId)); if (!book) return []; const metrics = calculateLearningRhythm({ startDate: assignment.startDate, totalQuestions: book.totalQuestions, completedQuestions: assignment.completedQuestions ?? 0, studyDaysPerWeek: assignment.studyDaysPerWeek, pauses: assignment.pauses ?? [], asOf: today }); return [{ id: String(assignment._id), bookName: String(book.name), categoryName: categoryMap.get(String(assignment.categoryId)) || null, startDate: assignment.startDate, completedQuestions: assignment.completedQuestions ?? 0, pageReached: assignment.pageReached ?? null, totalQuestions: book.totalQuestions, totalPages: book.totalPages ?? null, pauses: assignment.pauses ?? [], metrics }]; });
    return NextResponse.json({ student: { id, name: student.name }, classes: classes.map((item) => ({ id: String(item._id), name: item.name, educatorName: educatorMap.get(String(item.educatorId)) || null })), history, books: learning }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { console.error("Erro no detalhe individual de frequência", error); return NextResponse.json({ error: "Não foi possível carregar o detalhamento individual." }, { status: 500 }); }
}
