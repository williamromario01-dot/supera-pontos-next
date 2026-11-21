import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { canManageCollaboratorClass, COLLABORATOR_COLLECTIONS } from "@/lib/collaborator-development";
import { COLLABORATOR_DB, collaboratorScope } from "@/lib/collaborator-route";

export async function GET(request: NextRequest) {
  const authenticated = await authenticateRequest(request);
  if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db);
  if (!scope) return NextResponse.json({ error: "Escola não autorizada." }, { status: 403 });
  const filter: Record<string, unknown> = { schoolId: scope.schoolId, active: { $ne: false } };
  if (!canManageCollaboratorClass(authenticated.auth.role)) filter.participantIds = authenticated.auth.userId;
  const rows = await db.collection(COLLABORATOR_COLLECTIONS.classes).find(filter).sort({ name: 1 }).toArray();
  return NextResponse.json({ classes: rows.map((row) => ({ id: String(row._id), name: row.name, classType: "collaborators", participantCount: row.participantIds?.length ?? 0, managerIds: (row.managerIds ?? []).map(String) })) });
}
export async function POST(request: NextRequest) {
  const authenticated = await authenticateRequest(request);
  if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!canManageCollaboratorClass(authenticated.auth.role)) return NextResponse.json({ error: "Somente administradores autorizados podem criar esta turma." }, { status: 403 });
  const body = await request.json(); const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
  const db = (await clientPromise).db(COLLABORATOR_DB); const scope = await collaboratorScope(request, authenticated.auth, db, body.schoolId);
  if (!scope) return NextResponse.json({ error: "Escola não autorizada." }, { status: 403 });
  const duplicate = await db.collection(COLLABORATOR_COLLECTIONS.classes).findOne({ schoolId: scope.schoolId, normalizedName: name.toLocaleLowerCase("pt-BR"), active: { $ne: false } });
  if (duplicate) return NextResponse.json({ error: "Já existe uma turma de colaboradores com esse nome." }, { status: 409 });
  const now = new Date(); const row = { _id: new ObjectId(), ...scope, name, normalizedName: name.toLocaleLowerCase("pt-BR"), classType: "collaborators", participantIds: [], managerIds: [authenticated.auth.userId], active: true, createdAt: now, updatedAt: now };
  await db.collection(COLLABORATOR_COLLECTIONS.classes).insertOne(row);
  return NextResponse.json({ class: { id: String(row._id), name, classType: row.classType } }, { status: 201 });
}
