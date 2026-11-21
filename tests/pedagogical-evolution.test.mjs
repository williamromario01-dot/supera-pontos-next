import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPedagogicalEvolution, classifyPedagogicalDelta, PEDAGOGICAL_STABILITY_MARGIN_PP } from "../src/lib/pedagogical-evolution.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const category = (id, current, previous, goal = 100) => ({ categoryId: id, categoryName: id === "c1" ? "Ábaco dinâmico" : "Categoria dinâmica", goal, realized: current === null ? 0 : current * goal / 100, performancePercentage: current, goalReached: current === null ? null : current >= 100, applicable: true, previousRealized: previous === null ? null : previous * goal / 100, previousPerformancePercentage: previous, evolutionStatus: current === null || previous === null ? "INSUFFICIENT_DATA" : current - previous >= 10 ? "EVOLVED" : current - previous <= -10 ? "DECLINED" : "MAINTAINED", evolutionDeltaPercentagePoints: current === null || previous === null ? null : current - previous });
const student = (id, name, classIds, metrics, status) => ({ studentId: id, studentName: name, classIds, classNames: classIds.map((item) => item === "t1" ? "Turma 1" : "Turma 2"), categoryMetrics: metrics, goalReached: metrics.some((item) => item.goalReached), evolutionStatus: status ?? metrics[0].evolutionStatus, hasPedagogicalRecords: metrics.some((item) => item.performancePercentage !== null), performancePercentage: metrics[0].performancePercentage, previousPerformancePercentage: metrics[0].previousPerformancePercentage, evolutionDeltaPercentagePoints: metrics[0].evolutionDeltaPercentagePoints });
const report = (weekStart, students, overrides = {}) => ({ _id: `school:${weekStart}`, companyName: "Empresa", schoolName: "Escola", weekStart, weekEnd: "2026-11-08", closedAt: new Date(), status: "CLOSED", reportVersion: 2, generatedBy: "automatic", timezone: "America/Sao_Paulo", scoringMode: "automatic", summary: { activeStudents: students.length }, studentMetrics: students, categoryMetrics: [{ categoryId: "c1", categoryName: "Ábaco dinâmico", weeklyGoal: 100 }, { categoryId: "c2", categoryName: "Categoria dinâmica", weeklyGoal: 50 }], educatorMetrics: [{ educatorId: "e1", educatorName: "William", classIds: ["t1"], classNames: ["Turma 1"] }, { educatorId: "e2", educatorName: "Daiane", classIds: ["t2"], classNames: ["Turma 2"] }], classMetrics: [{ classId: "t1", className: "Turma 1", educatorId: "e1", educatorName: "William" }, { classId: "t2", className: "Turma 2", educatorId: "e2", educatorName: "Daiane" }], ...overrides });
const currentStudents = [
  student("s1", "Ana", ["t1"], [category("c1", 100, 50), category("c2", 80, 60)]),
  student("s2", "Bruno", ["t1", "t2"], [category("c1", 60, 60), category("c2", 40, 70)]),
  student("s3", "Carla", ["t2"], [category("c1", 20, 60), category("c2", null, null)]),
  student("s4", "Novo", ["t2"], [category("c1", 40, null)], "INSUFFICIENT_DATA"),
];
const current = report("2026-11-02", currentStudents);
const prior = report("2026-10-26", [student("s1", "Ana", ["t1"], [category("c1", 50, 40)], "EVOLVED"), student("s2", "Bruno", ["t1", "t2"], [category("c1", 60, 80)], "DECLINED"), student("s3", "Carla", ["t2"], [category("c1", 60, 80)], "DECLINED")]);

test("1. desempenho geral da unidade usa alunos únicos", () => assert.equal(buildPedagogicalEvolution([current, prior]).summary.total, 4));
test("2. filtro por educador retorna somente seus alunos", () => assert.deepEqual(buildPedagogicalEvolution([current, prior], { educatorId: "e1" }).students.map((item) => item.studentId), ["s1", "s2"]));
test("3. filtro por turma restringe o recorte", () => assert.deepEqual(buildPedagogicalEvolution([current, prior], { classId: "t2" }).students.map((item) => item.studentId), ["s2", "s3", "s4"]));
test("4. filtros combinados funcionam", () => assert.deepEqual(buildPedagogicalEvolution([current, prior], { educatorId: "e2", classId: "t2", categoryId: "c1", search: "car" }).students.map((item) => item.studentId), ["s3"]));
test("5. categorias permanecem dinâmicas", () => assert.deepEqual(buildPedagogicalEvolution([current]).filters.categories.map((item) => item.name), ["Ábaco dinâmico", "Categoria dinâmica"]));
test("6. aluno em múltiplas turmas não é duplicado", () => assert.equal(buildPedagogicalEvolution([current]).students.filter((item) => item.studentId === "s2").length, 1));
test("7. educador consolida várias turmas por registros individuais", () => assert.equal(buildPedagogicalEvolution([current]).educators.find((item) => item.id === "e2").students, 3));
test("8. evolução do educador usa diferença de proporção de metas", () => assert.equal(buildPedagogicalEvolution([current]).educators.find((item) => item.id === "e1").deltaPercentagePoints, 25));
test("9. evolução individual usa cumprimento médio limitado", () => assert.equal(buildPedagogicalEvolution([current]).students.find((item) => item.studentId === "s1").deltaPercentagePoints, 35));
test("10. maior evolução é identificada", () => assert.deepEqual(buildPedagogicalEvolution([current]).highlights.greatestEvolution.map((item) => item.studentId), ["s1"]));
test("11. menor evolução positiva não é queda", () => assert.deepEqual(buildPedagogicalEvolution([current]).highlights.smallestEvolution.map((item) => item.studentId), ["s1"]));
test("12. maior queda é identificada separadamente", () => assert.deepEqual(buildPedagogicalEvolution([current]).highlights.greatestDecline.map((item) => item.studentId), ["s3"]));
test("13. empates preservam todos os alunos", () => { const tied = report("2026-11-02", [student("a", "A", ["t1"], [category("c1", 80, 50)]), student("b", "B", ["t1"], [category("c1", 90, 60)])]); assert.equal(buildPedagogicalEvolution([tied]).highlights.greatestEvolution.length, 2); });
test("14. ausência de evolução positiva gera destaque vazio", () => { const data = report("2026-11-02", [student("a", "A", ["t1"], [category("c1", 50, 60)])]); assert.equal(buildPedagogicalEvolution([data]).highlights.greatestEvolution.length, 0); });
test("15. ausência de queda gera destaque vazio", () => { const data = report("2026-11-02", [student("a", "A", ["t1"], [category("c1", 80, 60)])]); assert.equal(buildPedagogicalEvolution([data]).highlights.greatestDecline.length, 0); });
test("16. margem de estabilidade é centralizada", () => { assert.equal(PEDAGOGICAL_STABILITY_MARGIN_PP, 10); assert.equal(classifyPedagogicalDelta(9), "MAINTAINED"); });
test("17. ausência de dados não vira queda", () => assert.equal(buildPedagogicalEvolution([current]).students.find((item) => item.studentId === "s4").attentionStatus, "INSUFFICIENT_DATA"));
test("18. recém-matriculado permanece sem comparação", () => assert.equal(buildPedagogicalEvolution([current]).students.find((item) => item.studentId === "s4").deltaPercentagePoints, null));
test("19. transferência entre turmas respeita o snapshot atual", () => assert.deepEqual(buildPedagogicalEvolution([current], { classId: "t2" }).students.find((item) => item.studentId === "s2").classIds, ["t2"]));
test("20. mudança de educador usa responsabilidade congelada da turma", () => assert.equal(buildPedagogicalEvolution([current], { educatorId: "e2" }).students.some((item) => item.studentId === "s2"), true));
test("21. bônus não existe entre métricas elegíveis", async () => assert.doesNotMatch(await read("src/lib/pedagogical-evolution.ts"), /pointEvents|special_bonus/));
test("22. metas diferentes por categoria são normalizadas em percentual", () => assert.equal(buildPedagogicalEvolution([current], { categoryId: "c2" }).students.find((item) => item.studentId === "s1").currentPercentage, 80));
test("23. alterações de metas preservam percentuais de cada período", () => { const data = report("2026-11-02", [student("a", "A", ["t1"], [category("c1", 100, 50, 200)])]); assert.equal(buildPedagogicalEvolution([data]).students[0].deltaPercentagePoints, 50); });
test("24. comparação usa snapshots semanais ordenados", () => assert.equal(buildPedagogicalEvolution([prior, current]).weekStart, "2026-11-02"));
test("25. semana incompleta não é preenchida artificialmente", () => assert.equal(buildPedagogicalEvolution([current]).students.find((item) => item.studentId === "s4").history[0].deltaPercentagePoints, null));
test("26. pausa sem dado não conta como queda consecutiva", () => assert.equal(buildPedagogicalEvolution([current]).students.find((item) => item.studentId === "s4").declineStreak, 0));
test("27. uma queda gera atenção preventiva", () => assert.equal(buildPedagogicalEvolution([current]).students.find((item) => item.studentId === "s3").attentionStatus, "PREVENTIVE_ATTENTION"));
test("28. duas quedas geram atenção prioritária", () => assert.equal(buildPedagogicalEvolution([current, prior]).students.find((item) => item.studentId === "s3").declineStreak, 2));
test("29. três quedas geram acompanhamento individual", () => { const older = report("2026-10-19", [student("s3", "Carla", ["t2"], [category("c1", 80, 100)], "DECLINED")]); assert.equal(buildPedagogicalEvolution([current, prior, older]).students.find((item) => item.studentId === "s3").attentionStatus, "INDIVIDUAL_FOLLOW_UP"); });
test("30. melhora após atenção gera recuperação", () => { const improving = report("2026-11-02", [student("s2", "Bruno", ["t1"], [category("c1", 80, 60)], "EVOLVED")]); assert.equal(buildPedagogicalEvolution([improving, prior]).students[0].attentionStatus, "RECOVERING"); });
test("31. histórico individual preserva semanas reais", () => assert.deepEqual(buildPedagogicalEvolution([current, prior]).students.find((item) => item.studentId === "s1").history.map((item) => item.weekStart), ["2026-10-26", "2026-11-02"]));
test("32. desenvolvimento dos colaboradores não é lido pelo cálculo", async () => assert.doesNotMatch(await read("src/lib/pedagogical-evolution.ts"), /collaborator/i));
test("33. API valida perfis e restringe educador ao próprio id", async () => { const source = await read("src/app/api/management-reports/evolution/route.ts"); assert.match(source, /auth\.role === "educator" \? String\(auth\.userId\)/); });
test("34. API filtra por escola", async () => assert.match(await read("src/app/api/management-reports/evolution/route.ts"), /schoolId, status: "CLOSED"/));
test("35. API valida acesso multiempresa", async () => assert.match(await read("src/app/api/management-reports/evolution/route.ts"), /hasCompanySchoolAccess/));
test("36. interface integra evolução ao RGS", async () => assert.match(await read("src/components/WeeklyManagementReportView.tsx"), /PedagogicalEvolutionDashboard/));
test("37. relatórios históricos permanecem somente leitura", async () => assert.doesNotMatch(await read("src/app/api/management-reports/evolution/route.ts"), /updateOne|insertOne|deleteOne/));
test("38. Excel possui aba de evolução pedagógica", async () => assert.match(await read("src/lib/weekly-management-report-excel.ts"), /addWorksheet\("Evolução Pedagógica"\)/));
test("39. interface oferece busca e paginação", async () => { const source = await read("src/components/PedagogicalEvolutionDashboard.tsx"); assert.match(source, /Buscar por nome do aluno/); assert.match(source, /Página \{page\} de \{totalPages\}/); });
test("40. cálculo não altera pontos ou rankings", async () => { const source = await read("src/lib/pedagogical-evolution.ts"); assert.doesNotMatch(source, /collection\(|update|insert|delete|ranking/); });
