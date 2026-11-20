import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { LEARNING_COLLECTIONS } from "@/lib/learning-rhythm-model";
import { cleanText, DB_NAME, objectId, positiveInteger, resolveLearningScope, serialize, variants } from "@/lib/learning-rhythm-route";

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role === "student") return NextResponse.json({ error: "Perfil sem acesso às configurações." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME); const scope = await resolveLearningScope(request, result.auth, db);
  if (!scope) return NextResponse.json({ error: "Escola inválida ou não autorizada." }, { status: 403 });
  const books = await db.collection(LEARNING_COLLECTIONS.books).find({ schoolId: scope.schoolId }).sort({ active: -1, name: 1 }).toArray();
  return NextResponse.json({ books: books.map((book) => ({ ...serialize(book), averageQuestionsPerPage: book.totalPages ? book.totalQuestions / book.totalPages : 0 })) });
}
export async function POST(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!['admin','super_admin'].includes(result.auth.role)) return NextResponse.json({ error: "Somente administradores podem cadastrar livros." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME); const scope = await resolveLearningScope(request, result.auth, db);
  if (!scope) return NextResponse.json({ error: "Escola inválida ou não autorizada." }, { status: 403 });
  const body = await request.json(); const name = cleanText(body.name, 180); const categoryId = objectId(body.categoryId);
  const totalPages = positiveInteger(body.totalPages, 100_000); const totalQuestions = positiveInteger(body.totalQuestions, 1_000_000);
  if (!name || !categoryId || !totalPages || !totalQuestions) return NextResponse.json({ error: "Nome, categoria, páginas e questões são obrigatórios." }, { status: 400 });
  const category = await db.collection("categories").findOne({ _id: categoryId, $or: [{ schoolId: { $in: variants(scope.schoolId) } }, { schoolId: { $exists: false } }] });
  if (!category) return NextResponse.json({ error: "Categoria inválida para esta escola." }, { status: 400 });
  const now = new Date(); const book = { _id: new ObjectId(), ...scope, name, categoryId, totalPages, totalQuestions, active: true, createdAt: now, updatedAt: now };
  await db.collection(LEARNING_COLLECTIONS.books).insertOne(book);
  return NextResponse.json({ book: { ...serialize(book), averageQuestionsPerPage: totalQuestions / totalPages } }, { status: 201 });
}
