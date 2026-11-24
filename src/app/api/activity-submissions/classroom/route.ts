import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { registerAndApproveClassroomActivity } from "@/lib/activity-classroom-service";
import { activityRouteError, activitySubmissionsDisabledResponse, serializeActivity } from "@/lib/activity-submission-route";
import { activitySubmissionsEnabled } from "@/lib/activity-submission-service";
import { getOperationalAccessForAuth, subscriptionPastDueResponseForAccess } from "@/lib/subscription-access";

export async function POST(request: NextRequest) {
  if (!activitySubmissionsEnabled()) return activitySubmissionsDisabledResponse();
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { auth } = result;
    if (auth.role !== "educator") return NextResponse.json({ error: "Somente educadores podem registrar atividades presenciais." }, { status: 403 });
    if (!auth.schoolId || !auth.companyId) return NextResponse.json({ error: "Educador sem vínculo escolar válido." }, { status: 403 });
    const body = await request.json();
    const studentId = ObjectId.isValid(String(body.studentId)) ? new ObjectId(String(body.studentId)) : null;
    const categoryId = ObjectId.isValid(String(body.categoryId)) ? new ObjectId(String(body.categoryId)) : null;
    const activityAt = new Date(body.activityAt);
    if (!studentId || !categoryId || !Number.isFinite(activityAt.getTime())) return NextResponse.json({ error: "Aluno, categoria ou data inválidos." }, { status: 400 });
    const client = await clientPromise;
    const db = client.db("supera_pontos");
    const access = await getOperationalAccessForAuth(db, auth);
    if (!access.canPerformOperationalMutation) return NextResponse.json(subscriptionPastDueResponseForAccess(access), { status: 403 });
    const saved = await registerAndApproveClassroomActivity(client, db, {
      actorId: auth.userId, actorRole: "educator", companyId: auth.companyId, schoolId: auth.schoolId,
      studentId, categoryId, activityAt, reportedQuantity: body.reportedQuantity,
      pageReached: body.pageReached ?? null, book: body.book ?? null, observation: body.observation ?? null,
      idempotencyKey: request.headers.get("idempotency-key") ?? body.idempotencyKey,
    });
    return NextResponse.json({
      duplicate: saved.duplicate, activity: serializeActivity(saved.activity), pointsDifference: saved.approval.pointsDifference,
      resultingBalance: saved.approval.resultingBalance, weeklyProgress: saved.approval.targetQuantity > 0 ? saved.approval.approvedQuantity / saved.approval.targetQuantity : 0,
    }, { status: saved.duplicate ? 200 : 201 });
  } catch (error) { return activityRouteError(error); }
}
