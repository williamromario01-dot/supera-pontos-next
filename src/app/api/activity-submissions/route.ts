import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { ACTIVITY_COLLECTIONS } from "@/lib/activity-persistence-types";
import { activitySubmissionsEnabled, activityVisibilityFilter, submitActivity } from "@/lib/activity-submission-service";
import { activityRouteError, activitySubmissionsDisabledResponse, resolveActivitySchool, serializeActivity } from "@/lib/activity-submission-route";
import { getOperationalAccessForAuth, subscriptionPastDueResponseForAccess } from "@/lib/subscription-access";

const DB_NAME = "supera_pontos";

export async function POST(request: NextRequest) {
  if (!activitySubmissionsEnabled()) return activitySubmissionsDisabledResponse();
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const auth = result.auth;
    if (auth.role !== "student" && auth.role !== "educator") return NextResponse.json({ error: "Perfil sem permissão para submeter atividades." }, { status: 403 });
    if (!auth.schoolId || !auth.companyId) return NextResponse.json({ error: "Usuário sem vínculo escolar válido." }, { status: 403 });
    const body = await request.json();
    const studentId = auth.role === "student" ? auth.userId : ObjectId.isValid(String(body.studentId)) ? new ObjectId(String(body.studentId)) : null;
    const categoryId = ObjectId.isValid(String(body.categoryId)) ? new ObjectId(String(body.categoryId)) : null;
    const activityAt = new Date(body.activityAt);
    if (!studentId || !categoryId || !Number.isFinite(activityAt.getTime())) return NextResponse.json({ error: "Aluno, categoria ou data inválidos." }, { status: 400 });
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const access = await getOperationalAccessForAuth(db, auth);
    if (!access.canPerformOperationalMutation) return NextResponse.json(subscriptionPastDueResponseForAccess(access), { status: 403 });
    const submitted = await submitActivity(client, db, {
      actorId: auth.userId, actorRole: auth.role, companyId: auth.companyId, schoolId: auth.schoolId,
      studentId, categoryId, activityAt, reportedQuantity: body.reportedQuantity,
      pageReached: body.pageReached ?? null, book: body.book ?? null,
      idempotencyKey: request.headers.get("idempotency-key") ?? body.idempotencyKey,
    });
    return NextResponse.json({ duplicate: submitted.duplicate, activity: serializeActivity(submitted.activity) }, { status: submitted.duplicate ? 200 : 201 });
  } catch (error) { return activityRouteError(error); }
}

export async function GET(request: NextRequest) {
  if (!activitySubmissionsEnabled()) return activitySubmissionsDisabledResponse();
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (result.auth.role === "company_admin") return NextResponse.json({ error: "Perfil sem acesso pedagógico." }, { status: 403 });
    const schoolId = resolveActivitySchool(result.auth, request.nextUrl.searchParams.get("schoolId"));
    if (!schoolId) return NextResponse.json({ error: "Selecione uma escola válida." }, { status: 400 });
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const filter = await activityVisibilityFilter(db, { actorId: result.auth.userId, actorRole: result.auth.role, schoolId });
    const activities = await db.collection(ACTIVITY_COLLECTIONS.records).find(filter).sort({ activityAt: -1 }).limit(100).toArray();
    return NextResponse.json({ activities: activities.map(serializeActivity) });
  } catch (error) { return activityRouteError(error); }
}
