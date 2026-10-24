import ExcelJS, { type CellValue, type Worksheet } from "exceljs";
import type { EvolutionStatus, WeeklyReport, WeeklyReportV1 } from "./weekly-management-report-types.ts";
import { calculateVariation, immediatelyPrecedes } from "./weekly-management-report-view.ts";

const ORANGE = "FFF97316";
const DARK = "FF0F172A";
const SLATE = "FF475569";
const LIGHT = "FFF1F5F9";
const BORDER = "FFCBD5E1";
const WHITE = "FFFFFFFF";
const PERCENT_FORMAT = "0.0%";
const DATE_FORMAT = "dd/mm/yyyy";
const DATETIME_FORMAT = "dd/mm/yyyy hh:mm";

type RowValue = CellValue | undefined;
type Column = { header: string; key: string; width: number; format?: string };

export class UnsupportedWeeklyReportVersionError extends Error {
  constructor(version: unknown) {
    super(`Versão de relatório não suportada: ${String(version)}.`);
    this.name = "UnsupportedWeeklyReportVersionError";
  }
}

export class InvalidWeeklyReportSnapshotError extends Error {
  constructor() {
    super("Snapshot semanal inválido ou incompatível.");
    this.name = "InvalidWeeklyReportSnapshotError";
  }
}

export function asWeeklyReportV1(report: WeeklyReport): WeeklyReportV1 {
  if (report.reportVersion !== 1) throw new UnsupportedWeeklyReportVersionError(report.reportVersion);
  if (report.status !== "CLOSED" || !report.schoolName || !report.weekStart || !report.weekEnd || !report.summary || !Array.isArray(report.studentMetrics) || !Array.isArray(report.categoryMetrics) || !Array.isArray(report.educatorMetrics) || !Array.isArray(report.classMetrics)) {
    throw new InvalidWeeklyReportSnapshotError();
  }
  return report as WeeklyReportV1;
}

function civilDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function percentValue(value: number | null | undefined): number | null {
  return typeof value === "number" ? value / 100 : null;
}

function evolutionLabel(value: EvolutionStatus): string {
  return { EVOLVED: "Evoluiu", MAINTAINED: "Manteve", DECLINED: "Diminuiu", INSUFFICIENT_DATA: "Sem dados suficientes" }[value];
}

function yesNo(value: boolean | null): string {
  return value === null ? "Não aplicável" : value ? "Sim" : "Não";
}

function safeDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function applyIdentity(sheet: Worksheet, report: WeeklyReportV1, width: number) {
  sheet.views = [{ showGridLines: false }];
  sheet.mergeCells(1, 1, 1, width);
  sheet.getCell(1, 1).value = "SUPERPONTOS";
  sheet.getCell(1, 1).font = { name: "Arial", size: 15, bold: true, color: { argb: ORANGE } };
  sheet.mergeCells(2, 1, 2, width);
  sheet.getCell(2, 1).value = "Relatório Semanal de Gestão";
  sheet.getCell(2, 1).font = { name: "Arial", size: 12, bold: true, color: { argb: DARK } };
  sheet.getRow(4).values = ["Unidade", report.schoolName];
  sheet.getRow(5).values = ["Período", civilDate(report.weekStart), "a", civilDate(report.weekEnd)];
  sheet.getRow(6).values = ["Fechado em", safeDate(report.closedAt), null, null, "Versão", report.reportVersion];
  sheet.getCell("B5").numFmt = DATE_FORMAT;
  sheet.getCell("D5").numFmt = DATE_FORMAT;
  sheet.getCell("B6").numFmt = DATETIME_FORMAT;
  for (let row = 4; row <= 6; row += 1) sheet.getRow(row).eachCell((cell) => { cell.font = { name: "Arial", size: 10, color: { argb: SLATE } }; });
  sheet.getCell("A4").font = sheet.getCell("A5").font = sheet.getCell("A6").font = sheet.getCell("E6").font = { name: "Arial", size: 10, bold: true, color: { argb: DARK } };
}

function sectionTitle(sheet: Worksheet, row: number, title: string, width: number) {
  sheet.mergeCells(row, 1, row, width);
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
  cell.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(row).height = 22;
}

function addTable(sheet: Worksheet, startRow: number, columns: Column[], rows: Record<string, RowValue>[]) {
  const header = sheet.getRow(startRow);
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    sheet.getColumn(index + 1).width = column.width;
  });
  header.height = 30;
  rows.forEach((data, rowIndex) => {
    const row = sheet.getRow(startRow + 1 + rowIndex);
    columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.value = data[column.key] ?? null;
      cell.font = { name: "Arial", size: 10, color: { argb: DARK } };
      if (column.format) cell.numFmt = column.format;
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
      if (rowIndex % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
    });
  });
  if (rows.length) sheet.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow + rows.length, column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: startRow, showGridLines: false }];
  header.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
}

function comparisonText(current: number | null | undefined, previous: number | null | undefined, kind: "quantity" | "percentagePoints") {
  const variation = calculateVariation(current, previous, kind);
  if (!variation) return "Sem base comparável";
  const direction = variation.trend === "up" ? "aumento" : variation.trend === "down" ? "redução" : "sem variação";
  return `${direction} de ${Math.abs(variation.value).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${variation.suffix}`;
}

function addExecutiveSummary(workbook: ExcelJS.Workbook, report: WeeklyReportV1, previous: WeeklyReportV1 | null) {
  const sheet = workbook.addWorksheet("Resumo Executivo", { properties: { tabColor: { argb: ORANGE } } });
  applyIdentity(sheet, report, 6);
  sheet.getColumn(1).width = 38; sheet.getColumn(2).width = 18; sheet.getColumn(3).width = 4; sheet.getColumn(4).width = 38; sheet.getColumn(5).width = 18; sheet.getColumn(6).width = 20;
  sectionTitle(sheet, 8, "RESUMO DA SEMANA", 6);
  const goalReached = report.studentMetrics.filter((student) => student.goalReached === true).length;
  const inventoryTotal = report.inventoryMetrics.available ? report.inventoryMetrics.products.filter((product) => product.active).reduce((sum, product) => sum + product.stock, 0) : null;
  const metrics: Array<[string, number | null, string, number | null]> = [
    ["Alunos ativos", report.summary.activeStudents, "Alunos que evoluíram", report.summary.evolvedStudents],
    ["% dos ativos que evoluíram", percentValue(report.summary.evolvedAmongAllActiveStudentsPercentage), "% dos comparáveis que evoluíram", percentValue(report.summary.evolvedAmongComparableStudentsPercentage)],
    ["Alunos que mantiveram", report.summary.maintainedStudents, "Alunos que diminuíram", report.summary.declinedStudents],
    ["Sem dados suficientes", report.summary.insufficientDataStudents, "Alunos comparáveis", report.summary.comparableStudents],
    ["Metas atingidas", goalReached, "Cobertura pedagógica", percentValue(report.summary.pedagogicalCoveragePercentage)],
    ["Alunos com registros", report.summary.studentsWithPedagogicalRecords, "Alunos sem registros", report.summary.studentsWithoutPedagogicalRecords],
    ["Pontos atribuídos", report.summary.pointsAwarded, "Pontos resgatados", report.summary.pointsRedeemed],
    ["Resgates/prêmios", report.summary.redemptions, "Indicações", report.referralMetrics.total],
    ["Estoque no fechamento", inventoryTotal, "Produtos sem estoque", report.inventoryMetrics.outOfStockProducts],
  ];
  metrics.forEach((metric, index) => {
    const row = 9 + index;
    sheet.getRow(row).values = [metric[0], metric[1], null, metric[2], metric[3]];
    sheet.getCell(row, 1).font = sheet.getCell(row, 4).font = { name: "Arial", size: 10, color: { argb: SLATE } };
    sheet.getCell(row, 2).font = sheet.getCell(row, 5).font = { name: "Arial", size: 11, bold: true, color: { argb: DARK } };
  });
  for (const cell of ["B10", "E10", "E13"]) sheet.getCell(cell).numFmt = PERCENT_FORMAT;
  sectionTitle(sheet, 19, "COMPARAÇÃO COM A SEMANA ANTERIOR", 6);
  if (!previous) {
    sheet.mergeCells("A20:F21");
    sheet.getCell("A20").value = "Não há semana anterior fechada disponível para comparação.";
    sheet.getCell("A20").alignment = { vertical: "middle", wrapText: true };
  } else {
    const previousGoals = previous.studentMetrics.filter((student) => student.goalReached === true).length;
    const currentGoalPercent = report.summary.activeStudents ? goalReached / report.summary.activeStudents * 100 : null;
    const previousGoalPercent = previous.summary.activeStudents ? previousGoals / previous.summary.activeStudents * 100 : null;
    const comparisons = [
      ["Evolução entre ativos", comparisonText(report.summary.evolvedAmongAllActiveStudentsPercentage, previous.summary.evolvedAmongAllActiveStudentsPercentage, "percentagePoints")],
      ["Metas atingidas", comparisonText(currentGoalPercent, previousGoalPercent, "percentagePoints")],
      ["Cobertura pedagógica", comparisonText(report.summary.pedagogicalCoveragePercentage, previous.summary.pedagogicalCoveragePercentage, "percentagePoints")],
      ["Pontos atribuídos", comparisonText(report.summary.pointsAwarded, previous.summary.pointsAwarded, "quantity")],
      ["Pontos resgatados", comparisonText(report.summary.pointsRedeemed, previous.summary.pointsRedeemed, "quantity")],
      ["Indicações", comparisonText(report.referralMetrics.total, previous.referralMetrics.total, "quantity")],
    ];
    comparisons.forEach((item, index) => { sheet.getRow(20 + index).values = [item[0], item[1]]; });
  }
  sectionTitle(sheet, 27, "EVOLUÇÃO DOS ALUNOS", 6);
  sheet.getRow(28).values = ["Evoluíram", report.summary.evolvedStudents, null, "Mantiveram", report.summary.maintainedStudents];
  sheet.getRow(29).values = ["Diminuíram", report.summary.declinedStudents, null, "Sem dados suficientes", report.summary.insufficientDataStudents];
  sheet.getRow(30).values = ["Comparáveis / ativos", `${report.summary.comparableStudents} / ${report.summary.activeStudents}`];
  sheet.mergeCells("A31:F32");
  sheet.getCell("A31").value = "A evolução compara o desempenho proporcional às metas da semana com a semana anterior. Variações de ±10 pontos percentuais definem evolução, estabilidade ou redução conforme a metodologia do relatório.";
  sheet.getCell("A31").alignment = { wrapText: true, vertical: "middle" };
  sectionTitle(sheet, 34, "PONTOS DE ATENÇÃO", 6);
  const attention = [
    `${report.summary.declinedStudents} alunos apresentaram redução de desempenho.`,
    `${report.summary.studentsWithoutPedagogicalRecords} alunos ficaram sem registros pedagógicos.`,
    `${report.summary.insufficientDataStudents} alunos ainda não possuem dados suficientes.`,
    "Estoque baixo indisponível: o snapshot não possui estoque mínimo confiável.",
    `${report.inventoryMetrics.outOfStockProducts} produtos estão sem estoque.`,
  ];
  attention.forEach((text, index) => { sheet.getCell(35 + index, 1).value = text; sheet.mergeCells(35 + index, 1, 35 + index, 6); });
  for (let row = 20; row <= 40; row += 1) sheet.getRow(row).eachCell((cell) => { cell.font = { name: "Arial", size: 10, color: { argb: DARK } }; });
  sheet.getCell("A27").font = sheet.getCell("A34").font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function addUnavailableSheet(workbook: ExcelJS.Workbook, name: string, report: WeeklyReportV1, messages: string[]) {
  const sheet = workbook.addWorksheet(name);
  applyIdentity(sheet, report, 6);
  sectionTitle(sheet, 8, name.toUpperCase(), 6);
  messages.forEach((message, index) => {
    const row = 10 + index * 2;
    sheet.mergeCells(row, 1, row, 6);
    sheet.getCell(row, 1).value = message;
    sheet.getCell(row, 1).alignment = { wrapText: true };
  });
  sheet.getColumn(1).width = 28;
  for (let column = 2; column <= 6; column += 1) sheet.getColumn(column).width = 16;
}

function addDetailSheets(workbook: ExcelJS.Workbook, report: WeeklyReportV1) {
  const students = workbook.addWorksheet("Alunos"); applyIdentity(students, report, 8); sectionTitle(students, 8, "ALUNOS", 8);
  addTable(students, 10, [
    { header: "Aluno", key: "student", width: 30 }, { header: "Turma(s)", key: "classes", width: 30 },
    { header: "Desempenho anterior", key: "previous", width: 20, format: PERCENT_FORMAT }, { header: "Desempenho atual", key: "current", width: 18, format: PERCENT_FORMAT },
    { header: "Variação (p.p.)", key: "delta", width: 16, format: "0.0" }, { header: "Classificação", key: "evolution", width: 24 },
    { header: "Meta atingida?", key: "goal", width: 18 }, { header: "Teve registro pedagógico?", key: "records", width: 25 },
  ], [...report.studentMetrics].sort((a, b) => a.studentName.localeCompare(b.studentName, "pt-BR")).map((student) => ({ student: student.studentName, classes: student.classNames.join(", ") || "Sem turma no snapshot", previous: percentValue(student.previousPerformancePercentage), current: percentValue(student.performancePercentage), delta: student.evolutionDeltaPercentagePoints, evolution: evolutionLabel(student.evolutionStatus), goal: yesNo(student.goalReached), records: student.hasPedagogicalRecords ? "Sim" : "Não" })));

  const studentCategories = workbook.addWorksheet("Aluno x Categoria"); applyIdentity(studentCategories, report, 9); sectionTitle(studentCategories, 8, "ALUNO X CATEGORIA", 9);
  addTable(studentCategories, 10, [
    { header: "Aluno", key: "student", width: 28 }, { header: "Categoria", key: "category", width: 26 }, { header: "Meta", key: "goal", width: 12, format: "#,##0" },
    { header: "Realizado", key: "realized", width: 14, format: "#,##0" }, { header: "Desempenho anterior", key: "previous", width: 20, format: PERCENT_FORMAT },
    { header: "Desempenho atual", key: "current", width: 18, format: PERCENT_FORMAT }, { header: "Variação (p.p.)", key: "delta", width: 16, format: "0.0" },
    { header: "Evolução", key: "evolution", width: 24 }, { header: "Meta atingida?", key: "reached", width: 18 },
  ], report.studentMetrics.flatMap((student) => student.categoryMetrics.map((metric) => ({ student: student.studentName, category: metric.categoryName, goal: metric.goal, realized: metric.realized, previous: percentValue(metric.previousPerformancePercentage), current: percentValue(metric.performancePercentage), delta: metric.evolutionDeltaPercentagePoints, evolution: evolutionLabel(metric.evolutionStatus), reached: yesNo(metric.goalReached) }))));

  const categories = workbook.addWorksheet("Categorias"); applyIdentity(categories, report, 9); sectionTitle(categories, 8, "CATEGORIAS", 9);
  addTable(categories, 10, [
    { header: "Categoria", key: "name", width: 28 }, { header: "Meta semanal", key: "weeklyGoal", width: 16, format: "#,##0" }, { header: "Alunos comparáveis", key: "comparable", width: 20 },
    { header: "Evoluíram", key: "evolved", width: 14 }, { header: "% evoluíram", key: "evolvedPercentage", width: 16, format: PERCENT_FORMAT }, { header: "Mantiveram", key: "maintained", width: 14 },
    { header: "Diminuíram", key: "declined", width: 14 }, { header: "Sem dados suficientes", key: "insufficient", width: 22 }, { header: "Atingiram meta", key: "goals", width: 18 }, { header: "% atingiram meta", key: "goalPercentage", width: 19, format: PERCENT_FORMAT },
  ], [...report.categoryMetrics].sort((a, b) => a.categoryName.localeCompare(b.categoryName, "pt-BR")).map((category) => ({ name: category.categoryName, weeklyGoal: category.weeklyGoal, comparable: category.comparableStudents, evolved: category.evolvedStudents, evolvedPercentage: percentValue(category.evolvedPercentage), maintained: category.maintainedStudents, declined: category.declinedStudents, insufficient: category.insufficientDataStudents, goals: category.goalReachedStudents, goalPercentage: percentValue(category.goalReachedPercentage) })));

  const educators = workbook.addWorksheet("Educadores"); applyIdentity(educators, report, 11); sectionTitle(educators, 8, "EDUCADORES", 11);
  addTable(educators, 10, [
    { header: "Educador", key: "name", width: 28 }, { header: "Alunos acompanhados", key: "students", width: 20 }, { header: "Turmas atendidas", key: "classes", width: 18 }, { header: "Alunos com registros", key: "records", width: 20 },
    { header: "Cobertura", key: "coverage", width: 14, format: PERCENT_FORMAT }, { header: "Categorias trabalhadas", key: "categories", width: 22 }, { header: "Metas atingidas", key: "goals", width: 17 },
    { header: "Evoluíram", key: "evolved", width: 14 }, { header: "Mantiveram", key: "maintained", width: 14 }, { header: "Diminuíram", key: "declined", width: 14 }, { header: "Registros realizados", key: "recordCount", width: 20 },
  ], [...report.educatorMetrics].sort((a, b) => a.educatorName.localeCompare(b.educatorName, "pt-BR")).map((educator) => ({ name: educator.educatorName, students: educator.students, classes: educator.classIds.length, records: educator.studentsWithRecords, coverage: percentValue(educator.pedagogicalCoveragePercentage), categories: educator.categoriesWorked, goals: educator.goalReachedStudents, evolved: educator.evolvedStudents, maintained: educator.maintainedStudents, declined: educator.declinedStudents, recordCount: educator.recordCount })));

  const classes = workbook.addWorksheet("Turmas"); applyIdentity(classes, report, 9); sectionTitle(classes, 8, "TURMAS", 9);
  addTable(classes, 10, [
    { header: "Turma", key: "name", width: 28 }, { header: "Educador", key: "educator", width: 28 }, { header: "Alunos", key: "students", width: 12 }, { header: "Alunos com registros", key: "records", width: 20 },
    { header: "Cobertura", key: "coverage", width: 14, format: PERCENT_FORMAT }, { header: "Evoluíram", key: "evolved", width: 14 }, { header: "Mantiveram", key: "maintained", width: 14 }, { header: "Diminuíram", key: "declined", width: 14 }, { header: "Atingiram meta", key: "goals", width: 18 },
  ], [...report.classMetrics].sort((a, b) => a.className.localeCompare(b.className, "pt-BR")).map((item) => ({ name: item.className, educator: item.educatorName || "Sem educador vinculado", students: item.students, records: item.studentsWithRecords, coverage: percentValue(item.pedagogicalCoveragePercentage), evolved: item.evolvedStudents, maintained: item.maintainedStudents, declined: item.declinedStudents, goals: item.goalReachedStudents })));

  const referrals = workbook.addWorksheet("Indicações"); applyIdentity(referrals, report, 6); sectionTitle(referrals, 8, "INDICAÇÕES", 3);
  addTable(referrals, 10, [{ header: "Tipo", key: "type", width: 28 }, { header: "Status no fechamento", key: "status", width: 32 }, { header: "Quantidade", key: "count", width: 16 }], [
    { type: "Total", status: "Todas as indicações", count: report.referralMetrics.total },
    ...Object.entries(report.referralMetrics.byStatus).map(([status, count]) => ({ type: "Status", status, count })),
    ...Object.entries(report.referralMetrics.byAttendanceStatus).map(([status, count]) => ({ type: "Presença do indicado", status, count })),
  ]);
  referrals.getCell("A9").value = "O snapshot armazena somente totais agregados; não há detalhamento nominal histórico.";
  referrals.mergeCells("A9:C9");

  const redemptions = workbook.addWorksheet("Resgates"); applyIdentity(redemptions, report, 6); sectionTitle(redemptions, 8, "RESGATES", 4);
  redemptions.getRow(9).values = ["Quantidade de resgates", report.redemptionMetrics.count, "Pontos utilizados", report.redemptionMetrics.pointsSpent];
  addTable(redemptions, 11, [{ header: "Produto/prêmio", key: "product", width: 36 }, { header: "Pontos utilizados", key: "points", width: 20, format: "#,##0" }, { header: "Status", key: "status", width: 20 }, { header: "Data", key: "date", width: 18, format: DATE_FORMAT }], report.redemptionMetrics.items.map((item) => ({ product: item.productName, points: item.pointsSpent, status: item.status, date: safeDate(item.createdAt) })));

  const inventory = workbook.addWorksheet("Estoque"); applyIdentity(inventory, report, 6); sectionTitle(inventory, 8, "ESTOQUE", 4);
  inventory.getCell("A9").value = "A movimentação histórica completa de estoque ainda não está disponível nesta versão. O snapshot não possui estoque mínimo confiável.";
  inventory.mergeCells("A9:D9"); inventory.getCell("A9").alignment = { wrapText: true };
  addTable(inventory, 11, [{ header: "Produto", key: "product", width: 38 }, { header: "Origem", key: "source", width: 20 }, { header: "Estoque no fechamento", key: "stock", width: 22, format: "#,##0" }, { header: "Status", key: "status", width: 18 }], report.inventoryMetrics.products.map((product) => ({ product: product.productName, source: product.source === "point_store" ? "Loja de pontos" : "Produtos Supera", stock: product.stock, status: !product.active ? "Inativo" : product.stock === 0 ? "Sem estoque" : "Disponível" })));
}

export function weeklyReportExcelFilename(report: WeeklyReport): string {
  const safeSchool = report.schoolName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "Unidade";
  return `SUPERPONTOS_${safeSchool}_${report.weekStart}_a_${report.weekEnd}.xlsx`;
}

export async function generateWeeklyManagementReportExcel(input: { report: WeeklyReport; previous?: WeeklyReport | null }): Promise<Buffer> {
  const report = asWeeklyReportV1(input.report);
  const previous = input.previous && immediatelyPrecedes(input.previous.weekStart, report.weekStart) ? asWeeklyReportV1(input.previous) : null;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SUPERPONTOS";
  workbook.created = safeDate(report.closedAt) || new Date(0);
  workbook.modified = workbook.created;
  workbook.calcProperties.fullCalcOnLoad = false;
  addExecutiveSummary(workbook, report, previous);
  addDetailSheets(workbook, report);
  addUnavailableSheet(workbook, "Frequência", report, ["Os dados de presença e faltas ainda não estão disponíveis nesta versão do SUPERPONTOS.", "Esta ausência de informação não representa zero faltas ou 100% de presença."]);
  addUnavailableSheet(workbook, "Vendas", report, ["Os dados históricos de vendas ainda não estão disponíveis nesta versão do SUPERPONTOS.", "A ausência de estrutura histórica não representa ausência de vendas."]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
