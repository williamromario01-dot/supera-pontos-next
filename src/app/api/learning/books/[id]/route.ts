import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { LEARNING_COLLECTIONS } from "@/lib/learning-rhythm-model";
import { cleanText, DB_NAME, objectId, positiveInteger, resolveLearningScope } from "@/lib/learning-rhythm-route";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!['admin','super_admin'].includes(result.auth.role)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME); const scope = await resolveLearningScope(request, result.auth, db); const id = objectId((await context.params).id);
  if (!scope || !id) return NextResponse.json({ error: "Livro ou escola inválidos." }, { status: 400 });
  const body = await request.json(); const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) { const value = cleanText(body.name, 180); if (!value) return NextResponse.json({ error: "Nome inválido." }, { status: 400 }); update.name = value; }
  if (body.totalPages !== undefined) { const value = positiveInteger(body.totalPages, 100_000); if (!value) return NextResponse.json({ error: "Páginas inválidas." }, { status: 400 }); update.totalPages = value; }
  if (body.totalQuestions !== undefined) { const value = positiveInteger(body.totalQuestions, 1_000_000); if (!value) return NextResponse.json({ error: "Questões inválidas." }, { status: 400 }); update.totalQuestions = value; }
  if (body.active !== undefined) update.active = body.active === true;
  const changed = await db.collection(LEARNING_COLLECTIONS.books).updateOne({ _id: id, schoolId: scope.schoolId }, { $set: update });
  if (!changed.matchedCount) return NextResponse.json({ error: "Livro não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
