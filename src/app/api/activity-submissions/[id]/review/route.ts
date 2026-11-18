import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { processActivityApproval } from "@/lib/activity-approval-service";
import { activitySubmissionsEnabled } from "@/lib/activity-submission-service";
import { activityRouteError, activitySubmissionsDisabledResponse, resolveActivitySchool } from "@/lib/activity-submission-route";
import { activityApprovalsEnabled, automaticActivityScoringEnabled } from "@/lib/school-scoring-mode";
import { getOperationalAccessForAuth, subscriptionPastDueResponseForAccess } from "@/lib/subscription-access";

const DB_NAME = "supera_pontos";
const variants = (id: ObjectId) => [id, id.toHexString()];

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!activitySubmissionsEnabled() || !activityApprovalsEnabled() || !automaticActivityScoringEnabled()) return activitySubmissionsDisabledResponse();
  try {
    const authenticated = await authenticateRequest(request);
    if (!authenticated.authenticated) return NextResponse.json({ error: "NÃ£o autenticado." }, { status: 401 });
    const auth = authenticated.auth;
    if (!(["educator", "admin", "super_admin"] as string[]).includes(auth.role)) return NextResponse.json({ error: "Perfil sem permissÃ£o para revisar atividades." }, { status: 403 });
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ID invÃ¡lido." }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const schoolId = resolveActivitySchool(auth, body.schoolId);
    if (!schoolId) return NextResponse.json({ error: "Selecione uma escola vÃ¡lida." }, { status: 400 });
    if (!auth.companyId && auth.role !== "super_admin") return NextResponse.json({ error: "UsuÃ¡rio sem empresa vÃ¡lida." }, { status: 403 });
    const decision = body.decision;
    if (decision !== "approved" && decision !== "corrected" && decision !== "rejected") return NextResponse.json({ error: "DecisÃ£o invÃ¡lida." }, { status: 400 });
    const approvedQuantity = decision === "rejected" ? 0 : Number(body.approvedQuantity);
    const expectedActivityRevision = Number(body.expectedActivityRevision);
    const idempotencyKey = String(request.headers.get("idempotency-key") ?? body.idempotencyKey ?? "");
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const access = await getOperationalAccessForAuth(db, auth);
    if (!access.canPerformOperationalMutation) return NextResponse.json(subscriptionPastDueResponseForAccess(access), { status: 403 });
    let authorizedStudentIds: ObjectId[] | undefined;
    if (auth.role === "educator") {
      const classes = await db.collection("classes").find({ schoolId: { $in: variants(schoolId) }, educatorId: { $in: variants(auth.userId) }, active: { $ne: false } }, { projection: { studentIds: 1 } }).toArray();
      authorizedStudentIds = [...new Map(classes.flatMap((row) => Array.isArray(row.studentIds) ? row.studentIds : []).filter((value) => ObjectId.isValid(String(value))).map((value) => [String(value), new ObjectId(String(value))])).values()];
    }
    const result = await processActivityApproval(client, db, {
      activityId: new ObjectId(id), schoolId, educatorId: auth.userId,
      actorRole: auth.role as "educator" | "admin" | "super_admin", authorizedStudentIds,
      decision, approvedQuantity, idempotencyKey, expectedActivityRevision,
      justification: typeof body.justification === "string" ? body.justification : null,
      automaticScoringEnabled: true,
    });
    return NextResponse.json({
      state: result.state, duplicate: result.duplicate, activityId: String(result.activityId),
      approvedQuantity: result.approvedQuantity, weeklyGoal: result.targetQuantity,
      maximumPoints: result.maximumPoints, calculatedPoints: result.calculatedPoints,
      pointsDifference: result.pointsDifference, resultingBalance: result.resultingBalance,
      weeklyProgress: result.targetQuantity > 0 ? Math.min(1, result.approvedQuantity / result.targetQuantity) : 0,
      activityRevision: result.activityRevision, ledgerRevision: result.ledgerRevision,
      adjustmentPendencyId: result.adjustmentPendencyId ? String(result.adjustmentPendencyId) : null,
    });
  } catch (error) { return activityRouteError(error); }
}
