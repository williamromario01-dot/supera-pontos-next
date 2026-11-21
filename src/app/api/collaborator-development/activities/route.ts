import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { canManageCollaboratorClass, canParticipateAsCollaborator, COLLABORATOR_COLLECTIONS, deterministicCollaboratorId } from "@/lib/collaborator-development";
import { COLLABORATOR_DB, collaboratorScope, oid } from "@/lib/collaborator-route";
import { activitySubmissionsEnabled } from "@/lib/activity-submission-service";
import { getEffectiveSchoolScoringMode } from "@/lib/school-scoring-mode";
import { getActivityWeek } from "@/lib/weekly-calendar";

export async function GET(request: NextRequest) {
  const authenticated = await authenticateRequest(request); if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db); if (!scope) return NextResponse.json({ error: "Escola não autorizada." }, { status: 403 });
  const filter: Record<string, unknown> = { schoolId: scope.schoolId }; if (!canManageCollaboratorClass(authenticated.auth.role)) filter.participantId = authenticated.auth.userId;
  const rows = await db.collection(COLLABORATOR_COLLECTIONS.activities).find(filter).sort({ activityAt: -1 }).limit(200).toArray();
  return NextResponse.json({ activities: rows.map((row) => ({ id: String(row._id), participantId: String(row.participantId), classId: String(row.classId), assignmentId: String(row.assignmentId), categoryId: String(row.categoryId), reportedQuantity: row.reportedQuantity, approvedQuantity: row.approvedQuantity, status: row.status, activityAt: row.activityAt, pointsGranted: row.pointsGranted ?? 0, revision: row.revision })) });
}

export async function POST(request: NextRequest) {
  if (!activitySubmissionsEnabled()) return NextResponse.json({ error: "Recurso não disponível." }, { status: 404 });
  const authenticated = await authenticateRequest(request); if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 }); if (!canParticipateAsCollaborator(authenticated.auth.role)) return NextResponse.json({ error: "Perfil não elegível." }, { status: 403 });
  const body = await request.json(); const assignmentId = oid(body.assignmentId); const quantity = Number(body.reportedQuantity); const key = String(request.headers.get("idempotency-key") ?? body.idempotencyKey ?? "").trim(); const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db, body.schoolId);
  if (!scope || !assignmentId || !(quantity > 0) || key.length < 8 || key.length > 160) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); if ((await getEffectiveSchoolScoringMode(db, scope.schoolId)) !== "automatic") return NextResponse.json({ error: "A escola utiliza pontuação tradicional." }, { status: 409 });
  const assignment = await db.collection(COLLABORATOR_COLLECTIONS.assignments).findOne({ _id: assignmentId, schoolId: scope.schoolId, participantId: authenticated.auth.userId, active: { $ne: false } }); if (!assignment) return NextResponse.json({ error: "Livro não vinculado a este participante." }, { status: 403 });
  const group = await db.collection(COLLABORATOR_COLLECTIONS.classes).findOne({ _id: assignment.classId, schoolId: scope.schoolId, participantIds: authenticated.auth.userId, active: { $ne: false } }); if (!group) return NextResponse.json({ error: "Participação inválida." }, { status: 403 });
  const id = deterministicCollaboratorId(`submission:${scope.schoolId}`, key); const duplicate = await db.collection(COLLABORATOR_COLLECTIONS.activities).findOne({ _id: id }); if (duplicate) return NextResponse.json({ duplicate: true, activity: { id: String(duplicate._id), status: duplicate.status } });
  const now = new Date(); const week = getActivityWeek(now); const row = { _id: id, ...scope, classId: assignment.classId, assignmentId, participantId: authenticated.auth.userId, participantRole: authenticated.auth.role, categoryId: assignment.categoryId, bookId: assignment.bookId, activityAt: now, weekStart: week.weekStart, weekEnd: week.weekEnd, reportedQuantity: quantity, approvedQuantity: null, status: "pending", pointsGranted: 0, submissionIdempotencyKey: key, revision: 0, createdAt: now, updatedAt: now };
  try { await db.collection(COLLABORATOR_COLLECTIONS.activities).insertOne(row); } catch (error) { if ((error as { code?: number }).code === 11000) return NextResponse.json({ duplicate: true, activity: { id: String(id), status: "pending" } }); throw error; }
  return NextResponse.json({ duplicate: false, activity: { id: String(id), status: "pending" } }, { status: 201 });
}
