import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { LEARNING_COLLECTIONS } from "@/lib/learning-rhythm-model";
import { DB_NAME, objectId, resolveLearningScope } from "@/lib/learning-rhythm-route";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!['admin','educator','super_admin'].includes(result.auth.role)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME); const scope = await resolveLearningScope(request, result.auth, db); const id = objectId((await context.params).id);
  if (!scope || !id) return NextResponse.json({ error: "Vínculo inválido." }, { status: 400 });
  const body = await request.json(); const update: Record<string, unknown> = { updatedAt: new Date() };
  if (Array.isArray(body.studyDaysPerWeek) && body.studyDaysPerWeek.length && body.studyDaysPerWeek.every((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)) update.studyDaysPerWeek = [...new Set(body.studyDaysPerWeek)].sort();
  if (Array.isArray(body.pauses)) {
    const pauses = body.pauses.filter((pause: unknown): pause is { startDate: string; endDate: string; reason?: string } => Boolean(pause && typeof pause === "object" && /^\d{4}-\d{2}-\d{2}$/.test((pause as { startDate?: string }).startDate ?? "") && /^\d{4}-\d{2}-\d{2}$/.test((pause as { endDate?: string }).endDate ?? "")));
    if (pauses.length !== body.pauses.length) return NextResponse.json({ error: "Pausa inválida." }, { status: 400 }); update.pauses = pauses;
  }
  if (body.active === false) update.active = false;
  const changed = await db.collection(LEARNING_COLLECTIONS.assignments).updateOne({ _id: id, schoolId: scope.schoolId }, { $set: update });
  return changed.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Vínculo não encontrado." }, { status: 404 });
}
