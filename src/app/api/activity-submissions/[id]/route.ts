import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { ACTIVITY_COLLECTIONS } from "@/lib/activity-persistence-types";
import { activitySubmissionsEnabled, activityVisibilityFilter } from "@/lib/activity-submission-service";
import { activityRouteError, activitySubmissionsDisabledResponse, resolveActivitySchool, serializeActivity } from "@/lib/activity-submission-route";

const DB_NAME = "supera_pontos";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!activitySubmissionsEnabled()) return activitySubmissionsDisabledResponse();
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (result.auth.role === "company_admin") return NextResponse.json({ error: "Perfil sem acesso pedagógico." }, { status: 403 });
    const id = (await context.params).id;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    const schoolId = resolveActivitySchool(result.auth, request.nextUrl.searchParams.get("schoolId"));
    if (!schoolId) return NextResponse.json({ error: "Selecione uma escola válida." }, { status: 400 });
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const visibility = await activityVisibilityFilter(db, { actorId: result.auth.userId, actorRole: result.auth.role, schoolId });
    const activity = await db.collection(ACTIVITY_COLLECTIONS.records).findOne({ ...visibility, _id: new ObjectId(id) });
    if (!activity) return NextResponse.json({ error: "Atividade não encontrada." }, { status: 404 });
    return NextResponse.json({ activity: serializeActivity(activity) });
  } catch (error) { return activityRouteError(error); }
}
