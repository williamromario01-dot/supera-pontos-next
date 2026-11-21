import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { canManageCollaboratorClass, canParticipateAsCollaborator, COLLABORATOR_COLLECTIONS } from "@/lib/collaborator-development";
import { COLLABORATOR_DB, collaboratorScope, idVariants, oid } from "@/lib/collaborator-route";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authenticated = await authenticateRequest(request); if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db); const classId = oid((await context.params).id);
  if (!scope || !classId) return NextResponse.json({ error: "Turma ou escola inválida." }, { status: 400 });
  const row = await db.collection(COLLABORATOR_COLLECTIONS.classes).findOne({ _id: classId, schoolId: scope.schoolId, active: { $ne: false } }); if (!row) return NextResponse.json({ error: "Turma não encontrada." }, { status: 404 });
  if (!canManageCollaboratorClass(authenticated.auth.role) && !(row.participantIds ?? []).some((id: unknown) => String(id) === String(authenticated.auth.userId))) return NextResponse.json({ error: "Sem acesso à turma." }, { status: 403 });
  const participants = await db.collection("users").find({ _id: { $in: row.participantIds ?? [] }, active: { $ne: false } }, { projection: { name: 1, email: 1, role: 1, points: 1 } }).sort({ name: 1 }).toArray();
  const available = canManageCollaboratorClass(authenticated.auth.role) ? await db.collection("users").find({ _id: { $nin: row.participantIds ?? [] }, role: { $in: ["educator", "admin", "company_admin", "super_admin"] }, active: { $ne: false }, $or: [{ schoolId: { $in: idVariants(scope.schoolId) } }, { companyId: scope.companyId, role: "company_admin" }, { role: "super_admin" }] }, { projection: { name: 1, email: 1, role: 1 } }).sort({ name: 1 }).toArray() : [];
  return NextResponse.json({ participants: participants.map((item) => ({ id: String(item._id), name: item.name, email: item.email, role: item.role, points: item.points ?? 0 })), availableParticipants: available.map((item) => ({ id: String(item._id), name: item.name, email: item.email, role: item.role })) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authenticated = await authenticateRequest(request); if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!canManageCollaboratorClass(authenticated.auth.role)) return NextResponse.json({ error: "Sem permissão para gerenciar participantes." }, { status: 403 });
  const body = await request.json(); const participantId = oid(body.participantId); const classId = oid((await context.params).id);
  const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db, body.schoolId);
  if (!scope || !classId || !participantId) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const participant = await db.collection("users").findOne({ _id: participantId, active: { $ne: false } });
  if (!participant || !canParticipateAsCollaborator(participant.role)) return NextResponse.json({ error: "Perfil não elegível." }, { status: 400 });
  if (participant.role === "educator" || participant.role === "admin") {
    if (!idVariants(scope.schoolId).some((value) => String(value) === String(participant.schoolId)) || String(participant.companyId) !== String(scope.companyId)) return NextResponse.json({ error: "Participante fora da escola ou empresa." }, { status: 403 });
  } else if (participant.role === "company_admin" && String(participant.companyId) !== String(scope.companyId)) return NextResponse.json({ error: "Administrador fora da empresa." }, { status: 403 });
  const changed = await db.collection(COLLABORATOR_COLLECTIONS.classes).updateOne({ _id: classId, schoolId: scope.schoolId, active: { $ne: false } }, { $addToSet: { participantIds: participantId }, $set: { updatedAt: new Date() } });
  if (!changed.matchedCount) return NextResponse.json({ error: "Turma não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, participant: { id: String(participant._id), name: participant.name, role: participant.role } });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authenticated = await authenticateRequest(request); if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 }); if (!canManageCollaboratorClass(authenticated.auth.role)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const body = await request.json(); const participantId = oid(body.participantId), classId = oid((await context.params).id); const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db, body.schoolId); if (!scope || !participantId || !classId) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const activeAssignment = await db.collection(COLLABORATOR_COLLECTIONS.assignments).findOne({ classId, participantId, active: { $ne: false } }); if (activeAssignment) return NextResponse.json({ error: "Inative os vínculos de livros antes de remover o participante." }, { status: 409 });
  const changed = await db.collection(COLLABORATOR_COLLECTIONS.classes).updateOne({ _id: classId, schoolId: scope.schoolId }, { $pull: { participantIds: participantId }, $set: { updatedAt: new Date() } } as never); return changed.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Turma não encontrada." }, { status: 404 });
}
