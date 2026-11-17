import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import { authenticateRequest, getSchoolObjectId } from "@/lib/auth";
import {
  getEffectiveSchoolScoringMode, scheduleSchoolScoringMode, SCORING_MODE_COLLECTION,
  ScoringModeAuthorizationError, ScoringModeConflictError, ScoringModeValidationError,
  serializeScoringModeChange,
  scoringModeConfigurationEnabled,
} from "@/lib/school-scoring-mode";

const DB_NAME = "supera_pontos";

function errorResponse(error: unknown) {
  if (error instanceof ScoringModeValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof ScoringModeAuthorizationError) return NextResponse.json({ error: "OperaÃ§Ã£o nÃ£o autorizada." }, { status: 403 });
  if (error instanceof ScoringModeConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  console.error("Scoring mode error", error);
  return NextResponse.json({ error: "NÃ£o foi possÃ­vel processar o modo de pontuaÃ§Ã£o." }, { status: 500 });
}

async function scope(request: NextRequest, explicitlyRequestedSchool?: unknown) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return { response: NextResponse.json({ error: "NÃ£o autenticado." }, { status: 401 }) };
  const auth = result.auth;
  if (auth.role !== "admin" && auth.role !== "super_admin") return { response: NextResponse.json({ error: "Perfil sem permissÃ£o." }, { status: 403 }) };
  const requested = explicitlyRequestedSchool ?? request.nextUrl.searchParams.get("schoolId");
  const schoolId = auth.role === "super_admin" ? getSchoolObjectId(requested) : auth.schoolId;
  if (!schoolId) return { response: NextResponse.json({ error: "Selecione uma escola vÃ¡lida." }, { status: 400 }) };
  return { auth, schoolId };
}

export async function GET(request: NextRequest) {
  if (!scoringModeConfigurationEnabled()) return NextResponse.json({ error: "Recurso nÃ£o disponÃ­vel." }, { status: 404 });
  try {
    const scoped = await scope(request);
    if ("response" in scoped) return scoped.response;
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const school = await db.collection("schools").findOne({ _id: scoped.schoolId }, { projection: { companyId: 1 } });
    if (!school || (scoped.auth.role !== "super_admin" && String(school.companyId) !== String(scoped.auth.companyId))) return NextResponse.json({ error: "Escola nÃ£o encontrada." }, { status: 404 });
    const now = new Date();
    const mode = await getEffectiveSchoolScoringMode(db, scoped.schoolId, now);
    const scheduled = await db.collection(SCORING_MODE_COLLECTION).findOne({ schoolId: scoped.schoolId, effectiveAt: { $gt: now } }, { sort: { effectiveAt: 1 } });
    return NextResponse.json({ mode, scheduled: scheduled ? serializeScoringModeChange(scheduled as never) : null });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  if (!scoringModeConfigurationEnabled()) return NextResponse.json({ error: "Recurso nÃ£o disponÃ­vel." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const scoped = await scope(request, body.schoolId);
    if ("response" in scoped) return scoped.response;
    const schoolId = scoped.schoolId;
    if (!schoolId || (scoped.auth.role === "super_admin" && !body.schoolId)) return NextResponse.json({ error: "Superadministrador deve informar explicitamente a escola." }, { status: 400 });
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const school = await db.collection("schools").findOne({ _id: schoolId }, { projection: { companyId: 1 } });
    if (!school || !(school.companyId instanceof ObjectId)) return NextResponse.json({ error: "Escola nÃ£o encontrada." }, { status: 404 });
    if (scoped.auth.role !== "super_admin" && String(school.companyId) !== String(scoped.auth.companyId)) return NextResponse.json({ error: "OperaÃ§Ã£o nÃ£o autorizada." }, { status: 403 });
    const outcome = await scheduleSchoolScoringMode(client, db, {
      companyId: school.companyId, schoolId, actorId: scoped.auth.userId,
      actorRole: scoped.auth.role as "admin" | "super_admin", futureMode: body.mode as "legacy" | "automatic",
      idempotencyKey: String(request.headers.get("idempotency-key") ?? body.idempotencyKey ?? ""),
    });
    return NextResponse.json({ duplicate: outcome.duplicate, change: serializeScoringModeChange(outcome.change) }, { status: outcome.duplicate ? 200 : 201 });
  } catch (error) { return errorResponse(error); }
}
