import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest, getSchoolObjectId } from "@/lib/auth";
import { ActivityAdjustmentAuthorizationError, ActivityAdjustmentBlockedError, ActivityAdjustmentNotFoundError, decideActivityAdjustment } from "@/lib/activity-adjustment-service";
import { ActivityPersistenceConflictError, ActivityPersistenceValidationError } from "@/lib/activity-persistence";
import { activityApprovalsEnabled, automaticActivityScoringEnabled } from "@/lib/school-scoring-mode";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!activityApprovalsEnabled() || !automaticActivityScoringEnabled()) return NextResponse.json({ error: "Recurso não disponível." }, { status: 404 });
  try {
    const authenticated = await authenticateRequest(request);
    if (!authenticated.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const auth = authenticated.auth;
    if (auth.role !== "admin" && auth.role !== "super_admin") return NextResponse.json({ error: "Perfil sem permissão." }, { status: 403 });
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const schoolId = auth.role === "super_admin" ? getSchoolObjectId(body.schoolId) : auth.schoolId;
    if (!schoolId) return NextResponse.json({ error: "Selecione uma escola válida." }, { status: 400 });
    const client = await clientPromise;
    const db = client.db("supera_pontos");
    const school = await db.collection("schools").findOne({ _id: schoolId }, { projection: { companyId: 1 } });
    if (!school || (auth.role !== "super_admin" && String(school.companyId) !== String(auth.companyId))) return NextResponse.json({ error: "Escola não encontrada." }, { status: 404 });
    const result = await decideActivityAdjustment(client, db, {
      pendencyId: new ObjectId(id), schoolId, actorId: auth.userId, actorRole: auth.role,
      action: body.action as "resolve" | "cancel", justification: String(body.justification ?? ""),
      idempotencyKey: String(request.headers.get("idempotency-key") ?? body.idempotencyKey ?? ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ActivityPersistenceValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ActivityAdjustmentAuthorizationError) return NextResponse.json({ error: "Operação não autorizada." }, { status: 403 });
    if (error instanceof ActivityAdjustmentNotFoundError) return NextResponse.json({ error: "Pendência não encontrada." }, { status: 404 });
    if (error instanceof ActivityAdjustmentBlockedError || error instanceof ActivityPersistenceConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Activity adjustment error", error);
    return NextResponse.json({ error: "Não foi possível decidir a pendência." }, { status: 500 });
  }
}
