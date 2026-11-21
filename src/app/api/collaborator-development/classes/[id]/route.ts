import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import {
  canManageCollaboratorClass,
  COLLABORATOR_COLLECTIONS,
} from "@/lib/collaborator-development";
import {
  COLLABORATOR_DB,
  collaboratorScope,
  oid,
} from "@/lib/collaborator-route";

async function authorizedClassMutation(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  body: Record<string, unknown>
) {
  const authenticated = await authenticateRequest(request);
  if (!authenticated.authenticated) {
    return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  if (!canManageCollaboratorClass(authenticated.auth.role)) {
    return { error: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  }

  const id = oid((await context.params).id);
  const db = (await clientPromise).db(COLLABORATOR_DB);
  const scope = await collaboratorScope(
    request,
    authenticated.auth,
    db,
    body.schoolId
  );
  if (!scope || !id) {
    return { error: NextResponse.json({ error: "Dados inválidos." }, { status: 400 }) };
  }

  return { authenticated, db, id, scope };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const body = (await request.json()) as Record<string, unknown>;
  const result = await authorizedClassMutation(request, context, body);
  if ("error" in result) return result.error;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
  }

  const normalizedName = name.toLocaleLowerCase("pt-BR");
  const duplicate = await result.db
    .collection(COLLABORATOR_COLLECTIONS.classes)
    .findOne({
      _id: { $ne: result.id },
      schoolId: result.scope.schoolId,
      normalizedName,
      active: { $ne: false },
    });
  if (duplicate) {
    return NextResponse.json(
      { error: "Já existe uma turma de colaboradores com esse nome." },
      { status: 409 }
    );
  }

  const changed = await result.db
    .collection(COLLABORATOR_COLLECTIONS.classes)
    .updateOne(
      {
        _id: result.id,
        schoolId: result.scope.schoolId,
        active: { $ne: false },
      },
      { $set: { name, normalizedName, updatedAt: new Date() } }
    );

  return changed.matchedCount
    ? NextResponse.json({ ok: true, class: { id: String(result.id), name } })
    : NextResponse.json({ error: "Turma não encontrada." }, { status: 404 });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await authorizedClassMutation(request, context, body);
  if ("error" in result) return result.error;

  const archivedAt = new Date();
  const changed = await result.db
    .collection(COLLABORATOR_COLLECTIONS.classes)
    .updateOne(
      {
        _id: result.id,
        schoolId: result.scope.schoolId,
        active: { $ne: false },
        $or: [
          { participantIds: { $exists: false } },
          { participantIds: { $size: 0 } },
        ],
      },
      {
        $set: {
          active: false,
          archivedAt,
          archivedBy: result.authenticated.auth.userId,
          updatedAt: archivedAt,
        },
      }
    );

  if (changed.matchedCount !== 1) {
    return NextResponse.json(
      { error: "Para excluir esta turma, remova todos os participantes primeiro." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, id: String(result.id) });
}
