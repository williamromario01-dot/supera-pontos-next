import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPedagogicalEvolution, PEDAGOGICAL_MAX_HISTORY_WEEKS } from "../src/lib/pedagogical-evolution.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const weeks = Array.from({ length: 14 }, (_, index) => `2026-${String(8 + Math.floor(index / 4)).padStart(2, "0")}-${String(3 + index * 7 % 28).padStart(2, "0")}`).sort();
const makeReport = (weekStart, percentage, previousPercentage) => ({
  _id: `school:${weekStart}`, companyName: "Empresa", schoolName: "Escola", weekStart, weekEnd: weekStart, closedAt: new Date(), status: "CLOSED", reportVersion: 2, generatedBy: "automatic", timezone: "America/Sao_Paulo", scoringMode: "automatic", summary: { activeStudents: 1 },
  studentMetrics: [{ studentId: "student-1", studentName: "Ana", classIds: ["class-1"], classNames: ["Turma 1"], goalReached: percentage >= 100, evolutionStatus: percentage > previousPercentage ? "EVOLVED" : "MAINTAINED", hasPedagogicalRecords: true, performancePercentage: percentage, previousPerformancePercentage: previousPercentage, evolutionDeltaPercentagePoints: percentage - previousPercentage, categoryMetrics: [{ categoryId: "category-1", categoryName: "Ábaco", goal: 100, realized: percentage, performancePercentage: percentage, goalReached: percentage >= 100, applicable: true, previousRealized: previousPercentage, previousPerformancePercentage: previousPercentage, evolutionStatus: percentage > previousPercentage ? "EVOLVED" : "MAINTAINED", evolutionDeltaPercentagePoints: percentage - previousPercentage }] }],
  categoryMetrics: [{ categoryId: "category-1", categoryName: "Ábaco", weeklyGoal: 100 }],
  educatorMetrics: [{ educatorId: "educator-1", educatorName: "William", classIds: ["class-1"], classNames: ["Turma 1"] }],
  classMetrics: [{ classId: "class-1", className: "Turma 1", educatorId: "educator-1", educatorName: "William" }],
});
const reports = weeks.map((week, index) => makeReport(week, Math.min(100, 40 + index * 5), Math.min(100, 35 + index * 5)));

test("histórico individual suporta recorte de 4 semanas", () => assert.equal(buildPedagogicalEvolution(reports.slice(-4)).students[0].history.length, 4));
test("histórico individual suporta recorte de 8 semanas", () => assert.equal(buildPedagogicalEvolution(reports.slice(-8)).students[0].history.length, 8));
test("histórico individual suporta recorte de 12 semanas", () => assert.equal(buildPedagogicalEvolution(reports.slice(-12)).students[0].history.length, 12));
test("período personalizado preserva somente semanas reais fornecidas", () => assert.deepEqual(buildPedagogicalEvolution(reports.slice(3, 10)).students[0].history.map((item) => item.weekStart), reports.slice(3, 10).map((item) => item.weekStart)));
test("período sem registros retorna análise vazia sem inventar dados", () => assert.equal(buildPedagogicalEvolution([]), null));
test("evolução histórica usa percentual inicial e final reais", () => { const history = buildPedagogicalEvolution(reports.slice(-4)).students[0].history; assert.equal(history.at(-1).percentage - history[0].percentage, 10); });
test("histórico do educador usa exclusivamente oportunidades dos alunos", () => { const educator = buildPedagogicalEvolution(reports.slice(-4), { educatorId: "educator-1" }).educators[0]; assert.equal(educator.history.length, 4); assert.equal(educator.history.at(-1).percentage, 100); });
test("detalhamento por turma mantém isolamento do recorte", () => {
  const analytics = buildPedagogicalEvolution(reports.slice(-4), { educatorId: "educator-1", classId: "class-1" });
  assert.deepEqual(analytics.classes.map((item) => item.id), ["class-1"]);
  assert.deepEqual(analytics.educators[0].classIds, ["class-1"]);
});
test("API valida janelas, datas, limite e consulta delimitada", async () => { const source = await read("src/app/api/management-reports/evolution/route.ts"); assert.match(source, /HISTORY_WINDOWS/); assert.match(source, /startDate > endDate/); assert.match(source, /730/); assert.match(source, /PEDAGOGICAL_MAX_HISTORY_WEEKS/); assert.equal(PEDAGOGICAL_MAX_HISTORY_WEEKS, 104); });
test("modal de educador abre de forma complementar e possui filtros internos", async () => { const dashboard = await read("src/components/PedagogicalEvolutionDashboard.tsx"); const detail = await read("src/components/PedagogicalEvolutionDetails.tsx"); assert.match(dashboard, /setSelectedEducator\(item\)/); assert.match(detail, /EducatorEvolutionModal/); assert.match(detail, /Turma do educador/); assert.match(detail, /Categoria do educador/); });
test("permissões e isolamento continuam aplicados na API existente", async () => { const source = await read("src/app/api/management-reports/evolution/route.ts"); assert.match(source, /hasCompanySchoolAccess/); assert.match(source, /auth\.role === "educator"/); assert.match(source, /schoolId, status: "CLOSED"/); });
test("detalhes permanecem separados de colaboradores e integrados ao RGS", async () => { const detail = await read("src/components/PedagogicalEvolutionDetails.tsx"); const core = await read("src/lib/pedagogical-evolution.ts"); const view = await read("src/components/WeeklyManagementReportView.tsx"); assert.doesNotMatch(detail + core, /collaborator-development|collaboratorMetrics/); assert.match(view, /PedagogicalEvolutionDashboard/); });
