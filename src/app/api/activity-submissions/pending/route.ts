import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { ACTIVITY_COLLECTIONS } from "@/lib/activity-persistence-types";
import { activitySubmissionsEnabled, activityVisibilityFilter } from "@/lib/activity-submission-service";
import { activityRouteError, activitySubmissionsDisabledResponse, resolveActivitySchool, serializeActivity } from "@/lib/activity-submission-route";
import { getEffectiveSchoolScoringMode } from "@/lib/school-scoring-mode";

const DB_NAME = "supera_pontos";

export async function GET(request: NextRequest) {
  if (!activitySubmissionsEnabled()) return activitySubmissionsDisabledResponse();
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (!["educator", "admin", "super_admin"].includes(result.auth.role)) return NextResponse.json({ error: "Perfil sem acesso à fila." }, { status: 403 });
    const schoolId = resolveActivitySchool(result.auth, request.nextUrl.searchParams.get("schoolId"));
    if (!schoolId) return NextResponse.json({ error: "Selecione uma escola válida." }, { status: 400 });
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const automaticMode = (await getEffectiveSchoolScoringMode(db, schoolId)) === "automatic";
    if (!automaticMode) return NextResponse.json({ automaticMode: false, activities: [] });
    const filter = await activityVisibilityFilter(db, { actorId: result.auth.userId, actorRole: result.auth.role as "educator" | "admin" | "super_admin", schoolId, pendingOnly: true });
    const activities = await db.collection(ACTIVITY_COLLECTIONS.records).find(filter).sort({ activityAt: 1 }).limit(100).toArray();
    return NextResponse.json({ automaticMode: true, activities: activities.map(serializeActivity) });
  } catch (error) { return activityRouteError(error); }
}
