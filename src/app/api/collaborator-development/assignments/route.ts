import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { canManageCollaboratorClass, COLLABORATOR_COLLECTIONS } from "@/lib/collaborator-development";
import { LEARNING_COLLECTIONS } from "@/lib/learning-rhythm-model";
import { calculateLearningRhythm, studentLearningMessage } from "@/lib/learning-rhythm";
import { COLLABORATOR_DB, collaboratorScope, oid } from "@/lib/collaborator-route";

export async function GET(request: NextRequest) {
  const authenticated = await authenticateRequest(request); if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db); if (!scope) return NextResponse.json({ error: "Escola não autorizada." }, { status: 403 });
  const filter: Record<string, unknown> = { schoolId: scope.schoolId, active: { $ne: false } }; if (!canManageCollaboratorClass(authenticated.auth.role)) filter.participantId = authenticated.auth.userId;
  const rows = await db.collection(COLLABORATOR_COLLECTIONS.assignments).find(filter).toArray(); const books = await db.collection(LEARNING_COLLECTIONS.books).find({ _id: { $in: rows.map((row) => row.bookId) }, schoolId: scope.schoolId }).toArray(); const bookMap = new Map(books.map((book) => [String(book._id), book]));
  const asOf = new Date().toISOString().slice(0, 10); const assignments = rows.flatMap((row) => { const book = bookMap.get(String(row.bookId)); if (!book) return []; const metrics = calculateLearningRhythm({ startDate: row.startDate, totalQuestions: book.totalQuestions, completedQuestions: row.completedQuestions ?? 0, studyDaysPerWeek: row.studyDaysPerWeek, pauses: row.pauses ?? [], asOf }); const safe = { id: String(row._id), participantId: String(row.participantId), classId: String(row.classId), bookId: String(row.bookId), bookName: book.name, categoryId: String(book.categoryId), completedQuestions: row.completedQuestions ?? 0, totalQuestions: book.totalQuestions, metrics }; return [canManageCollaboratorClass(authenticated.auth.role) ? safe : { ...safe, metrics: undefined, suggestion: studentLearningMessage(metrics), progressPercentage: metrics.progressPercentage }]; });
  return NextResponse.json({ assignments });
}

export async function POST(request: NextRequest) {
  const authenticated = await authenticateRequest(request); if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 }); if (!canManageCollaboratorClass(authenticated.auth.role)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const body = await request.json(); const classId = oid(body.classId), participantId = oid(body.participantId), bookId = oid(body.bookId); const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db, body.schoolId);
  if (!scope || !classId || !participantId || !bookId || typeof body.startDate !== "string" || !Array.isArray(body.studyDaysPerWeek) || body.studyDaysPerWeek.length === 0) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const [group, book] = await Promise.all([db.collection(COLLABORATOR_COLLECTIONS.classes).findOne({ _id: classId, schoolId: scope.schoolId, participantIds: participantId, active: { $ne: false } }), db.collection(LEARNING_COLLECTIONS.books).findOne({ _id: bookId, schoolId: scope.schoolId, active: true })]); if (!group || !book) return NextResponse.json({ error: "Turma, participante ou livro inválido." }, { status: 400 });
  const existing = await db.collection(COLLABORATOR_COLLECTIONS.assignments).findOne({ classId, participantId, bookId, active: { $ne: false } }); if (existing) return NextResponse.json({ error: "Livro já vinculado." }, { status: 409 });
  const now = new Date(); const row = { _id: new ObjectId(), ...scope, classId, participantId, bookId, categoryId: book.categoryId, startDate: body.startDate, studyDaysPerWeek: [...new Set(body.studyDaysPerWeek)], pauses: [], completedQuestions: 0, active: true, createdAt: now, updatedAt: now }; await db.collection(COLLABORATOR_COLLECTIONS.assignments).insertOne(row); return NextResponse.json({ assignment: { id: String(row._id) } }, { status: 201 });
}
