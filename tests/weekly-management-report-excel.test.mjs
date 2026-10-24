import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import {
  generateWeeklyManagementReportExcel,
  UnsupportedWeeklyReportVersionError,
  weeklyReportExcelFilename,
} from "../src/lib/weekly-management-report-excel.ts";
import { resolveWeeklyReportSchool } from "../src/lib/weekly-management-report-access.ts";

function fixture(overrides = {}) {
  return {
    _id: "school-1:2026-10-12",
    companyName: "GFarS",
    schoolName: "Jardim das Américas / Centro",
    weekStart: "2026-10-12",
    weekEnd: "2026-10-18",
    closedAt: "2026-10-19T16:00:00.000Z",
    status: "CLOSED",
    reportVersion: 1,
    generatedBy: "automatic",
    timezone: "America/Sao_Paulo",
    summary: { activeStudents: 2, activeEducators: 1, activeClasses: 1, pointsAwarded: 25, pointsRedeemed: 10, redemptions: 1, comparableStudents: 1, evolvedStudents: 1, maintainedStudents: 0, declinedStudents: 0, insufficientDataStudents: 1, evolvedAmongAllActiveStudentsPercentage: 50, evolvedAmongComparableStudentsPercentage: 100, studentsWithPedagogicalRecords: 1, studentsWithoutPedagogicalRecords: 1, pedagogicalCoveragePercentage: 50 },
    studentMetrics: [
      { studentId: "student-1", studentName: "Ana Histórica", classIds: ["class-1"], classNames: ["Turma Histórica"], performancePercentage: 120, previousPerformancePercentage: 80, evolutionDeltaPercentagePoints: 40, goalReached: true, evolutionStatus: "EVOLVED", hasPedagogicalRecords: true, categoryMetrics: [{ categoryId: "category-1", categoryName: "Categoria Personalizada", goal: 10, realized: 12, performancePercentage: 120, goalReached: true, applicable: true, previousRealized: 8, previousPerformancePercentage: 80, evolutionStatus: "EVOLVED", evolutionDeltaPercentagePoints: 40 }] },
      { studentId: "student-2", studentName: "Bruno", classIds: [], classNames: [], performancePercentage: null, previousPerformancePercentage: null, evolutionDeltaPercentagePoints: null, goalReached: false, evolutionStatus: "INSUFFICIENT_DATA", hasPedagogicalRecords: false, categoryMetrics: [] },
    ],
    categoryMetrics: [{ categoryId: "category-1", categoryName: "Categoria Personalizada", weeklyGoal: 10, comparableStudents: 1, evolvedStudents: 1, maintainedStudents: 0, declinedStudents: 0, insufficientDataStudents: 1, evolvedPercentage: 100, goalReachedStudents: 1, goalReachedPercentage: 50 }],
    educatorMetrics: [{ educatorId: "educator-1", educatorName: "Educadora Histórica", classIds: ["class-1"], classNames: ["Turma Histórica"], categoriesWorked: 1, recordCount: 2, students: 2, studentsWithRecords: 1, pedagogicalCoveragePercentage: 50, goalReachedStudents: 1, comparableStudents: 1, evolvedStudents: 1, maintainedStudents: 0, declinedStudents: 0 }],
    classMetrics: [{ classId: "class-1", className: "Turma Histórica", educatorId: "educator-1", educatorName: "Educadora Histórica", students: 2, studentsWithRecords: 1, pedagogicalCoveragePercentage: 50, goalReachedStudents: 1, comparableStudents: 1, evolvedStudents: 1, maintainedStudents: 0, declinedStudents: 0 }],
    referralMetrics: { available: true, total: 2, byStatus: { pending: 1, approved: 1 }, byAttendanceStatus: { attended: 1 } },
    salesMetrics: { available: false, reason: "Sem histórico de vendas." },
    redemptionMetrics: { available: true, count: 1, pointsSpent: 10, items: [{ redemptionId: "redemption-1", productName: "Prêmio Histórico", pointsSpent: 10, status: "delivered", createdAt: "2026-10-15T12:00:00.000Z" }] },
    inventoryMetrics: { available: true, snapshotOnly: true, movementAvailable: false, lowStockAvailable: false, reason: "Sem ledger.", products: [{ source: "point_store", productId: "product-1", productName: "Produto Histórico", stock: 0, active: true }], outOfStockProducts: 1 },
    attendanceMetrics: { available: false, reason: "Sem frequência." },
    ...overrides,
  };
}

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

test("produces a valid XLSX exclusively from an immutable v1 CLOSED snapshot", async () => {
  const report = fixture();
  const original = structuredClone(report);
  const buffer = await generateWeeklyManagementReportExcel({ report });
  if (process.env.WEEKLY_EXCEL_OUTPUT) await fs.writeFile(process.env.WEEKLY_EXCEL_OUTPUT, buffer);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.deepEqual(report, original);
  const workbook = await loadWorkbook(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Resumo Executivo", "Alunos", "Aluno x Categoria", "Categorias", "Educadores", "Turmas", "Indicações", "Resgates", "Estoque", "Frequência", "Vendas"]);
  assert.equal(workbook.getWorksheet("Resumo Executivo").getCell("B10").value, 0.5);
  assert.equal(workbook.getWorksheet("Resumo Executivo").getCell("B10").numFmt, "0.0%");
  assert.equal(workbook.getWorksheet("Alunos").getCell("A11").value, "Ana Histórica");
  assert.equal(workbook.getWorksheet("Aluno x Categoria").getCell("B11").value, "Categoria Personalizada");
  assert.equal(workbook.getWorksheet("Aluno x Categoria").getCell("F11").value, 1.2);
  assert.equal(workbook.getWorksheet("Aluno x Categoria").getCell("F11").numFmt, "0.0%");
  assert.match(String(workbook.getWorksheet("Frequência").getCell("A10").value), /ainda não estão disponíveis/);
  assert.match(String(workbook.getWorksheet("Vendas").getCell("A10").value), /ainda não estão disponíveis/);
  assert.match(String(workbook.getWorksheet("Estoque").getCell("A9").value), /movimentação histórica/);
  assert.ok(workbook.getWorksheet("Resgates").getCell("D12").value instanceof Date);
  assert.equal(workbook.getWorksheet("Resgates").getCell("D12").numFmt, "dd/mm/yyyy");
});

test("uses only the exact previous CLOSED snapshot supplied for comparison", async () => {
  const current = fixture();
  const previous = fixture({ _id: "school-1:2026-10-05", weekStart: "2026-10-05", weekEnd: "2026-10-11", summary: { ...fixture().summary, pointsAwarded: 20 } });
  const workbook = await loadWorkbook(await generateWeeklyManagementReportExcel({ report: current, previous }));
  assert.match(String(workbook.getWorksheet("Resumo Executivo").getCell("B23").value), /25,0 %/);
  const nonAdjacent = fixture({ weekStart: "2026-09-28", weekEnd: "2026-10-04" });
  const withoutComparison = await loadWorkbook(await generateWeeklyManagementReportExcel({ report: current, previous: nonAdjacent }));
  assert.match(String(withoutComparison.getWorksheet("Resumo Executivo").getCell("A20").value), /Não há semana anterior/);
});

test("rejects unknown report versions and non-CLOSED snapshots", async () => {
  await assert.rejects(() => generateWeeklyManagementReportExcel({ report: fixture({ reportVersion: 2 }) }), UnsupportedWeeklyReportVersionError);
  await assert.rejects(() => generateWeeklyManagementReportExcel({ report: fixture({ status: "OPEN" }) }), /Snapshot semanal inválido/);
});

test("sanitizes the download filename", () => {
  assert.equal(weeklyReportExcelFilename(fixture()), "SUPERPONTOS_Jardim_das_Americas_Centro_2026-10-12_a_2026-10-18.xlsx");
  assert.doesNotMatch(weeklyReportExcelFilename(fixture()), /[\\/:*?"<>|]/);
});

test("download route preserves authorization, CLOSED and school scoping without operational reads", async () => {
  const source = await fs.readFile("src/app/api/management-reports/[id]/excel/route.ts", "utf8");
  assert.match(source, /authenticateRequest/);
  assert.match(source, /resolveWeeklyReportSchool/);
  assert.match(source, /_id: id, schoolId: access\.schoolId, status: "CLOSED"/);
  assert.match(source, /weekStart: addCivilDays\(report\.weekStart, -7\), status: "CLOSED"/);
  assert.match(source, /collection<Document.*>\("weeklyReports"\)/s);
  assert.doesNotMatch(source, /collection\("(users|classes|categories|pointEvents|referrals|pointStoreRedemptions)"\)/);
  assert.match(source, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(source, /Content-Disposition/);
  assert.match(source, /private, no-store/);
});

test("Excel download roles preserve the stage 2 admin and super_admin policy", () => {
  const schoolA = new ObjectId();
  const schoolB = new ObjectId();
  const auth = (role, schoolId = null) => ({ role, schoolId, userId: new ObjectId(), companyId: null, user: {} });
  assert.equal(resolveWeeklyReportSchool(auth("admin", schoolA), null).allowed, true);
  assert.equal(resolveWeeklyReportSchool(auth("admin", schoolA), schoolB.toString()).allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("student", schoolA), null).allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("educator", schoolA), null).allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("company_admin"), schoolA.toString()).allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("super_admin"), null).allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("super_admin"), "invalid").allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("super_admin"), schoolA.toString()).allowed, true);
});
