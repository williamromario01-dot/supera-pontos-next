import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest, hasRequiredRole, schoolExists } from "@/lib/auth";
import { getCategoryScopeFilter } from "@/lib/category-scope";
import { getSundayWeekStart, parseCivilDate, resolveOperationalSchoolId } from "@/lib/planner";
import { isProtectedWeeklyDate } from "@/lib/weekly-management-report-core";

const STAFF = ["super_admin", "admin", "educator"] as const;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const variants = (id: ObjectId) => [id, id.toHexString()];

async function scope(request: NextRequest, body?: Record<string, unknown>) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return { error: bad("Não autenticado.", 401) };
  const { auth } = result;
  if (!hasRequiredRole(auth, [...STAFF, "student"])) return { error: bad("Sem permissão.", 403) };
  const requestedSchool = body?.schoolId ?? request.nextUrl.searchParams.get("schoolId");
  const schoolId = auth.role === "student" ? auth.schoolId : resolveOperationalSchoolId(auth, requestedSchool);
  if (!schoolId) return { error: bad(auth.role === "super_admin" ? "Selecione uma escola válida." : "Usuário sem escola.", 403) };
  const rawClassId = body?.classId ?? request.nextUrl.searchParams.get("classId");
  const classId = rawClassId ? ObjectId.isValid(String(rawClassId)) ? new ObjectId(String(rawClassId)) : null : null;
  if (rawClassId && !classId) return { error: bad("Turma inválida.") };
  return { auth, schoolId, classId };
}

export async function GET(request: NextRequest) {
  try {
    const access = await scope(request);
    if ("error" in access) return access.error;
    const requested = parseCivilDate(request.nextUrl.searchParams.get("weekStart"));
    if (!requested) return bad("Semana inválida.");
    const weekStart = getSundayWeekStart(requested);
    const db = (await clientPromise).db("supera_pontos");
    let effectiveClassId: ObjectId | null = access.classId ?? null;
    if (access.auth.role === "student") {
      const studentClass = await db.collection("classes").findOne({ schoolId: { $in: variants(access.schoolId) }, studentIds: { $in: variants(access.auth.userId) }, active: { $ne: false } }, { projection: { _id: 1 } });
      effectiveClassId = studentClass?._id instanceof ObjectId ? studentClass._id : null;
    }
    const filter: Document = { schoolId: { $in: variants(access.schoolId) }, weekStart };
    if (effectiveClassId) filter.classId = { $in: variants(effectiveClassId) };
    else filter.$or = [{ classId: null }, { classId: { $exists: false } }];
    let goal = await db.collection("weeklyGoals").findOne(filter);
    if (!goal && effectiveClassId) goal = await db.collection("weeklyGoals").findOne({ schoolId: { $in: variants(access.schoolId) }, weekStart, $or: [{ classId: null }, { classId: { $exists: false } }] });
    let items = goal?.items ?? [];
    if (access.auth.role === "student" && items.length) {
      const ledgers = await db.collection("weeklyScoreLedgers").find({ schoolId: access.schoolId, studentId: access.auth.userId, weekStart }).toArray();
      const quantities = new Map(ledgers.map((ledger) => [String(ledger.categoryId), Number(ledger.approvedQuantity ?? 0)]));
      items = items.map((item: Document) => ({ ...item, realized: quantities.get(String(item.categoryId)) ?? 0 }));
    }
    return NextResponse.json({ weekStart, scope: effectiveClassId ? "class" : "school", goal: goal ? { id: String(goal._id), weekStart, classId: goal.classId ? String(goal.classId) : null, items, updatedAt: goal.updatedAt, updatedBy: goal.updatedBy ? String(goal.updatedBy) : null, history: goal.history ?? [] } : null });
  } catch (error) { console.error("Erro ao consultar meta semanal:", error); return bad("Erro interno ao consultar meta semanal.", 500); }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const access = await scope(request, body);
    if ("error" in access) return access.error;
    if (!hasRequiredRole(access.auth, STAFF)) return bad("Este perfil não pode configurar metas.", 403);
    if (!(await schoolExists(access.schoolId))) return bad("Escola não encontrada.", 404);
    const requested = parseCivilDate(body.weekStart);
    if (!requested) return bad("Semana inválida.");
    const weekStart = getSundayWeekStart(requested);
    if (isProtectedWeeklyDate(weekStart)) return bad("Semanas fechadas não podem ter suas metas reescritas por este fluxo.", 409);
    const db = (await clientPromise).db("supera_pontos");
    if (access.auth.role === "educator") {
      if (!access.classId) return bad("Educadores devem selecionar uma turma.", 403);
      const assigned = await db.collection("classes").findOne({ _id: access.classId, schoolId: { $in: variants(access.schoolId) }, educatorId: { $in: variants(access.auth.userId) }, active: { $ne: false } });
      if (!assigned) return bad("Turma não autorizada para este educador.", 403);
    } else if (access.classId) {
      const belongs = await db.collection("classes").findOne({ _id: access.classId, schoolId: { $in: variants(access.schoolId) }, active: { $ne: false } });
      if (!belongs) return bad("Turma não encontrada nesta unidade.", 404);
    }
    if (!Array.isArray(body.items) || body.items.length > 50) return bad("Informe metas válidas para as categorias.");
    const parsed = body.items.map((value) => {
      const row = value as Record<string, unknown>;
      return { categoryId: ObjectId.isValid(String(row.categoryId)) ? new ObjectId(String(row.categoryId)) : null, goal: Number(row.goal), unit: typeof row.unit === "string" ? row.unit.trim() : "" };
    });
    if (parsed.some((item) => !item.categoryId || !Number.isFinite(item.goal) || item.goal <= 0 || item.goal > 1_000_000 || !item.unit || item.unit.length > 60)) return bad("Cada meta precisa de categoria, valor positivo e unidade de medida.");
    if (new Set(parsed.map((item) => String(item.categoryId))).size !== parsed.length) return bad("Não repita categorias na mesma semana.");
    const categories = parsed.length ? await db.collection("categories").find({ $and: [getCategoryScopeFilter(access.schoolId), { _id: { $in: parsed.map((item) => item.categoryId!) } }] }).toArray() : [];
    if (categories.length !== parsed.length) return bad("Uma ou mais categorias não pertencem à escola.", 403);
    const names = new Map(categories.map((category) => [String(category._id), String(category.name ?? "")]));
    const items = parsed.map((item) => ({ categoryId: item.categoryId, categoryName: names.get(String(item.categoryId)) ?? "", goal: item.goal, unit: item.unit }));
    const identity: Document = { schoolId: access.schoolId, weekStart, classId: access.classId ?? null };
    const previous = await db.collection("weeklyGoals").findOne(identity);
    const now = new Date();
    const update: Document = {
      $set: { items, updatedBy: access.auth.userId, updatedAt: now },
      $setOnInsert: { schoolId: access.schoolId, weekStart, classId: access.classId ?? null, createdBy: access.auth.userId, createdAt: now },
    };
    if (previous) update.$push = { history: { items: previous.items ?? [], changedBy: access.auth.userId, changedAt: now } };
    await db.collection("weeklyGoals").updateOne(identity, update, { upsert: true });
    return NextResponse.json({ message: "Metas semanais salvas.", goal: { weekStart, classId: access.classId ? String(access.classId) : null, items: items.map((item) => ({ ...item, categoryId: String(item.categoryId) })), updatedBy: String(access.auth.userId), updatedAt: now } });
  } catch (error) { console.error("Erro ao salvar meta semanal:", error); return bad("Erro interno ao salvar meta semanal.", 500); }
}
