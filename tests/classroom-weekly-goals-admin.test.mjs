import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ObjectId } from "mongodb";
import { resolveWeeklyGoal } from "../src/lib/weekly-goal-resolution.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const schoolId = new ObjectId(); const studentId = new ObjectId(); const categoryId = new ObjectId(); const classId = new ObjectId();

function goalDb(goals) {
  return { collection(name) {
    if (name === "classes") return { find: () => ({ toArray: async () => [{ _id: classId }] }) };
    if (name === "weeklyGoals") return { findOne: async (filter) => {
      if (filter.studentId?.$in) return goals.student ?? null;
      if (filter.classId) return goals.class ?? null;
      return goals.school ?? null;
    } };
    throw new Error(`unexpected collection ${name}`);
  } };
}
const row = (goal) => ({ items: [{ categoryId, goal, unit: "contas" }] });

test("meta individual prevalece sobre turma e unidade", async () => assert.equal((await resolveWeeklyGoal(goalDb({ student: row(120), class: row(80), school: row(40) }), { schoolId, studentId, categoryId, weekStart: "2026-11-22", category: { weeklyGoal: 10 } })).targetQuantity, 120));
test("meta da turma prevalece sobre unidade", async () => assert.equal((await resolveWeeklyGoal(goalDb({ class: row(80), school: row(40) }), { schoolId, studentId, categoryId, weekStart: "2026-11-22", category: { weeklyGoal: 10 } })).targetQuantity, 80));
test("meta da unidade prevalece sobre padrão da categoria", async () => assert.equal((await resolveWeeklyGoal(goalDb({ school: row(40) }), { schoolId, studentId, categoryId, weekStart: "2026-11-22", category: { weeklyGoal: 10 } })).targetQuantity, 40));
test("padrão oficial é usado apenas sem configuração semanal", async () => assert.deepEqual(await resolveWeeklyGoal(goalDb({}), { schoolId, studentId, categoryId, weekStart: "2026-11-22", category: { weeklyGoal: 10, unit: "atividades" } }), { targetQuantity: 10, unit: "atividades", source: "category_default" }));

test("registro presencial submete e aprova dentro da mesma transação", async () => { const source = await read("src/lib/activity-classroom-service.ts"); assert.match(source, /withTransaction/); assert.match(source, /submitActivityInTransaction/); assert.match(source, /processActivityApprovalInTransaction/); assert.match(source, /atividade pendente equivalente/i); });
test("rota presencial é exclusiva do educador e ignora pontos do navegador", async () => { const source = await read("src/app/api/activity-submissions/classroom/route.ts"); assert.match(source, /auth\.role !== "educator"/); assert.doesNotMatch(source, /body\.points/); assert.match(source, /getOperationalAccessForAuth/); });
test("turmas incorporam revisão e registro presencial por aluno", async () => { const source = await read("src/app/schools/[id]/classes/[classId]/page.tsx"); assert.match(source, /fixedStudentId=\{student\.id\}/); assert.match(source, /ActivityReviewPanel/); });
test("navegação remove Pontuação e dashboard posiciona atividade antes do ritmo", async () => { const navigation = await read("src/components/AppNavigation.tsx"); const dashboard = await read("src/app/dashboard/page.tsx"); assert.doesNotMatch(navigation, /label: "Pontuação"/); assert.ok(dashboard.lastIndexOf("<StudentActivityPanel") < dashboard.lastIndexOf("<StudentLearningRhythmPanel")); });
test("metas são numéricas, semanais, auditadas e bloqueiam períodos fechados", async () => { const source = await read("src/app/api/weekly-goals/route.ts"); assert.match(source, /Number\(row\.goal\)/); assert.match(source, /isProtectedWeeklyDate/); assert.match(source, /history/); assert.match(source, /Educadores devem selecionar uma turma/); });
test("gestão empresarial preserva escopo, último admin e revoga sessões", async () => { const source = await read("src/app/api/admins/[id]/route.ts"); const page = await read("src/app/company/units/[id]/page.tsx"); assert.match(source, /String\(administrator\.companyId\).*String\(authenticatedUser\.companyId\)/s); assert.match(source, /pelo menos um administrador ativo/); assert.match(source, /sessions\.deleteMany/); assert.match(page, /Administradores/); assert.match(page, /Alterar nome/); });
