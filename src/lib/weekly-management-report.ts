import { ObjectId, type Db, type Document } from "mongodb";
import { getCategoryScopeFilter } from "@/lib/category-scope";
import {
  WEEKLY_REPORT_TIME_ZONE,
  WEEKLY_REPORT_VERSION,
  addCivilDays,
  average,
  classifyEvolution,
  generationMode,
  latestEligiblePeriod,
  percentage,
  performancePercentage,
  periodForWeekStart,
  reportDocumentId,
  type EvolutionStatus,
  type WeeklyReportPeriod,
} from "@/lib/weekly-management-report-core";

const SCHOOL_ID = (schoolId: ObjectId) => ({ $in: [schoolId, schoolId.toString()] });
const id = (value: unknown) => value instanceof ObjectId ? value.toString() : String(value || "");
const name = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const dateBefore = (value: unknown, boundary: Date) => !(value instanceof Date) || value < boundary;

type CategoryRow = { categoryId: string; categoryName: string; goal: number; realized: number; performancePercentage: number | null; goalReached: boolean | null; applicable: boolean };
type WeeklyReportDbDocument = Document & { _id: string; schoolId: ObjectId };
type StudentMetric = {
  studentId: string; studentName: string; classIds: string[]; classNames: string[];
  categoryMetrics: Array<CategoryRow & { previousRealized: number | null; previousPerformancePercentage: number | null; evolutionStatus: EvolutionStatus; evolutionDeltaPercentagePoints: number | null }>;
  performancePercentage: number | null; previousPerformancePercentage: number | null; goalReached: boolean | null;
  evolutionStatus: EvolutionStatus; evolutionDeltaPercentagePoints: number | null; hasPedagogicalRecords: boolean;
};

function sumEvents(events: Document[]) {
  const totals = new Map<string, number>();
  for (const event of events) {
    if (!(event.studentId instanceof ObjectId) || !(event.categoryId instanceof ObjectId)) continue;
    const key = `${event.studentId}:${event.categoryId}`;
    totals.set(key, (totals.get(key) || 0) + Number(event.points || 0));
  }
  return totals;
}

function countStatuses(values: Document[], field: string) {
  const result: Record<string, number> = {};
  for (const value of values) {
    const status = name(value[field], "unknown");
    result[status] = (result[status] || 0) + 1;
  }
  return result;
}

export async function buildWeeklyReportSnapshot(db: Db, schoolId: ObjectId, period: WeeklyReportPeriod, now = new Date(), generatedBy: "automatic" | "recovery" = generationMode(now)) {
  const previous = periodForWeekStart(addCivilDays(period.weekStart, -7));
  const school = await db.collection("schools").findOne({ _id: schoolId });
  if (!school) throw new Error("SCHOOL_NOT_FOUND");
  if (!(school.companyId instanceof ObjectId)) throw new Error("SCHOOL_WITHOUT_COMPANY");
  const company = await db.collection("companies").findOne({ _id: school.companyId }, { projection: { tradeName: 1, legalName: 1 } });

  const [students, educators, classes, categories, redemptions, referrals, pointProducts, superaProducts] = await Promise.all([
    db.collection("users").find({ role: "student", schoolId: SCHOOL_ID(schoolId), active: { $ne: false }, $or: [{ createdAt: { $lt: period.nextWeekStartAt } }, { createdAt: { $exists: false } }] }, { projection: { name: 1, createdAt: 1 } }).toArray(),
    db.collection("users").find({ role: "educator", schoolId: SCHOOL_ID(schoolId), active: { $ne: false } }, { projection: { name: 1 } }).toArray(),
    db.collection("classes").find({ schoolId: SCHOOL_ID(schoolId), active: { $ne: false } }, { projection: { name: 1, educatorId: 1, studentIds: 1 } }).toArray(),
    db.collection("categories").find({ $and: [getCategoryScopeFilter(schoolId), { active: { $ne: false }, participatesInRanking: true, weeklyGoal: { $gt: 0 } }] }, { projection: { name: 1, weeklyGoal: 1, createdAt: 1 } }).toArray(),
    db.collection("pointStoreRedemptions").find({ schoolId: SCHOOL_ID(schoolId), createdAt: { $gte: period.startAt, $lt: period.nextWeekStartAt } }).toArray(),
    db.collection("referrals").find({ schoolId: SCHOOL_ID(schoolId), createdAt: { $gte: period.startAt, $lt: period.nextWeekStartAt } }).toArray(),
    db.collection("pointStoreProducts").find({ schoolId: SCHOOL_ID(schoolId) }, { projection: { name: 1, stock: 1, active: 1 } }).toArray(),
    db.collection("productsSupera").find({ schoolId: SCHOOL_ID(schoolId) }, { projection: { name: 1, stock: 1, active: 1 } }).toArray(),
  ]);

  // pointEvents antigos nem sempre possuem schoolId; o conjunto de alunos da escola é a fronteira confiável.
  const studentIds = students.map((student) => student._id);
  const scopedEvents = studentIds.length ? await db.collection("pointEvents").find({ studentId: { $in: studentIds }, createdAt: { $gte: previous.startAt, $lt: period.nextWeekStartAt } }).toArray() : [];
  const currentEvents = scopedEvents.filter((event) => event.createdAt instanceof Date && event.createdAt >= period.startAt);
  const previousEvents = scopedEvents.filter((event) => event.createdAt instanceof Date && event.createdAt < period.startAt);
  const currentTotals = sumEvents(currentEvents);
  const previousTotals = sumEvents(previousEvents);

  const classesByStudent = new Map<string, Document[]>();
  for (const classItem of classes) for (const studentId of Array.isArray(classItem.studentIds) ? classItem.studentIds : []) {
    const key = id(studentId); if (!key) continue;
    classesByStudent.set(key, [...(classesByStudent.get(key) || []), classItem]);
  }

  const studentMetrics: StudentMetric[] = students.map((student) => {
    const studentKey = id(student._id);
    const previousStudentApplicable = dateBefore(student.createdAt, period.startAt);
    const categoryMetrics = categories.map((category) => {
      const categoryKey = id(category._id); const goal = Number(category.weeklyGoal);
      const currentApplicable = dateBefore(category.createdAt, period.nextWeekStartAt);
      const previousApplicable = previousStudentApplicable && dateBefore(category.createdAt, period.startAt);
      const realized = currentTotals.get(`${studentKey}:${categoryKey}`) || 0;
      const previousRealized = previousApplicable ? previousTotals.get(`${studentKey}:${categoryKey}`) || 0 : null;
      const currentPerformance = currentApplicable ? performancePercentage(realized, goal) : null;
      const previousPerformance = previousApplicable && previousRealized !== null ? performancePercentage(previousRealized, goal) : null;
      return { categoryId: categoryKey, categoryName: name(category.name, "Categoria"), goal, realized, performancePercentage: currentPerformance, goalReached: currentPerformance === null ? null : currentPerformance >= 100, applicable: currentApplicable, previousRealized, previousPerformancePercentage: previousPerformance, ...classifyEvolution(currentPerformance, previousPerformance) };
    });
    const comparable = categoryMetrics.filter((metric) => metric.performancePercentage !== null && metric.previousPerformancePercentage !== null);
    const currentAverage = average(comparable.map((metric) => metric.performancePercentage!));
    const previousAverage = average(comparable.map((metric) => metric.previousPerformancePercentage!));
    const studentClasses = classesByStudent.get(studentKey) || [];
    return {
      studentId: studentKey, studentName: name(student.name, "Aluno"), classIds: studentClasses.map((item) => id(item._id)), classNames: studentClasses.map((item) => name(item.name, "Turma")), categoryMetrics,
      performancePercentage: currentAverage, previousPerformancePercentage: previousAverage,
      goalReached: categoryMetrics.some((metric) => metric.goalReached === true), ...classifyEvolution(currentAverage, previousAverage),
      hasPedagogicalRecords: currentEvents.some((event) => id(event.studentId) === studentKey && event.categoryId instanceof ObjectId),
    };
  });

  const statusCount = (status: EvolutionStatus) => studentMetrics.filter((student) => student.evolutionStatus === status).length;
  const comparableStudents = studentMetrics.length - statusCount("INSUFFICIENT_DATA");
  const evolvedStudents = statusCount("EVOLVED");
  const studentsWithRecords = studentMetrics.filter((student) => student.hasPedagogicalRecords).length;

  const categoryMetrics = categories.map((category) => {
    const rows = studentMetrics.map((student) => student.categoryMetrics.find((metric) => metric.categoryId === id(category._id))!).filter(Boolean);
    const comparable = rows.filter((row) => row.evolutionStatus !== "INSUFFICIENT_DATA");
    const evolved = comparable.filter((row) => row.evolutionStatus === "EVOLVED").length;
    const goalReached = rows.filter((row) => row.goalReached === true).length;
    return { categoryId: id(category._id), categoryName: name(category.name, "Categoria"), weeklyGoal: Number(category.weeklyGoal), comparableStudents: comparable.length, evolvedStudents: evolved, maintainedStudents: comparable.filter((row) => row.evolutionStatus === "MAINTAINED").length, declinedStudents: comparable.filter((row) => row.evolutionStatus === "DECLINED").length, insufficientDataStudents: rows.length - comparable.length, evolvedPercentage: percentage(evolved, comparable.length), goalReachedStudents: goalReached, goalReachedPercentage: percentage(goalReached, rows.filter((row) => row.applicable).length) };
  });

  const metricForGroup = (memberIds: string[]) => {
    const members = studentMetrics.filter((student) => memberIds.includes(student.studentId));
    const comparable = members.filter((student) => student.evolutionStatus !== "INSUFFICIENT_DATA");
    return { students: members.length, studentsWithRecords: members.filter((student) => student.hasPedagogicalRecords).length, pedagogicalCoveragePercentage: percentage(members.filter((student) => student.hasPedagogicalRecords).length, members.length), goalReachedStudents: members.filter((student) => student.goalReached).length, comparableStudents: comparable.length, evolvedStudents: comparable.filter((student) => student.evolutionStatus === "EVOLVED").length, maintainedStudents: comparable.filter((student) => student.evolutionStatus === "MAINTAINED").length, declinedStudents: comparable.filter((student) => student.evolutionStatus === "DECLINED").length };
  };

  const classMetrics = classes.map((classItem) => ({ classId: id(classItem._id), className: name(classItem.name, "Turma"), educatorId: id(classItem.educatorId) || null, educatorName: educators.find((item) => id(item._id) === id(classItem.educatorId)) ? name(educators.find((item) => id(item._id) === id(classItem.educatorId))!.name, "Educador") : null, ...metricForGroup((Array.isArray(classItem.studentIds) ? classItem.studentIds : []).map(id)) }));
  const educatorMetrics = educators.map((educator) => {
    const educatorClasses = classes.filter((item) => id(item.educatorId) === id(educator._id));
    const memberIds = [...new Set(educatorClasses.flatMap((item) => (Array.isArray(item.studentIds) ? item.studentIds : []).map(id)))];
    const educatorEvents = currentEvents.filter((event) => id(event.educatorId || event.awardedBy) === id(educator._id) && event.categoryId instanceof ObjectId);
    return { educatorId: id(educator._id), educatorName: name(educator.name, "Educador"), classIds: educatorClasses.map((item) => id(item._id)), classNames: educatorClasses.map((item) => name(item.name, "Turma")), categoriesWorked: [...new Set(educatorEvents.map((event) => id(event.categoryId)))].length, recordCount: educatorEvents.length, ...metricForGroup(memberIds) };
  });

  const inventoryProducts = [...pointProducts.map((product) => ({ source: "point_store", productId: id(product._id), productName: name(product.name, "Produto"), stock: Number(product.stock || 0), active: product.active !== false })), ...superaProducts.map((product) => ({ source: "products_supera", productId: id(product._id), productName: name(product.name, "Produto"), stock: Number(product.stock || 0), active: product.active !== false }))];
  const pedagogicalPoints = currentEvents.filter((event) => event.categoryId instanceof ObjectId && Number(event.points) > 0);

  return {
    _id: reportDocumentId(schoolId.toString(), period.weekStart), companyId: school.companyId, schoolId,
    companyName: company ? name(company.tradeName || company.legalName, "Empresa") : null, schoolName: name(school.name, "Unidade"), weekStart: period.weekStart, weekEnd: period.weekEnd,
    periodStartAt: period.startAt, nextWeekStartAt: period.nextWeekStartAt, closedAt: now, status: "CLOSED", reportVersion: WEEKLY_REPORT_VERSION, generatedBy, timezone: WEEKLY_REPORT_TIME_ZONE,
    summary: { activeStudents: students.length, activeEducators: educators.length, activeClasses: classes.length, pointsAwarded: pedagogicalPoints.reduce((total, event) => total + Number(event.points || 0), 0), pointsRedeemed: redemptions.reduce((total, item) => total + Number(item.pointsSpent || 0), 0), redemptions: redemptions.length, comparableStudents, evolvedStudents, maintainedStudents: statusCount("MAINTAINED"), declinedStudents: statusCount("DECLINED"), insufficientDataStudents: statusCount("INSUFFICIENT_DATA"), evolvedAmongAllActiveStudentsPercentage: percentage(evolvedStudents, students.length), evolvedAmongComparableStudentsPercentage: percentage(evolvedStudents, comparableStudents), studentsWithPedagogicalRecords: studentsWithRecords, studentsWithoutPedagogicalRecords: students.length - studentsWithRecords, pedagogicalCoveragePercentage: percentage(studentsWithRecords, students.length) },
    studentMetrics, categoryMetrics, educatorMetrics, classMetrics,
    referralMetrics: { available: true, total: referrals.length, byStatus: countStatuses(referrals, "status"), byAttendanceStatus: countStatuses(referrals, "attendanceStatus") },
    salesMetrics: { available: false, reason: "O sistema não persiste vendas concluídas; o contato via WhatsApp não comprova uma venda." },
    redemptionMetrics: { available: true, count: redemptions.length, pointsSpent: redemptions.reduce((total, item) => total + Number(item.pointsSpent || 0), 0), items: redemptions.map((item) => ({ redemptionId: id(item._id), studentId: id(item.studentId), productId: id(item.productId), productName: name(item.productName, "Produto"), pointsSpent: Number(item.pointsSpent || 0), status: name(item.status, "unknown"), createdAt: item.createdAt })) },
    inventoryMetrics: { available: true, snapshotOnly: true, movementAvailable: false, lowStockAvailable: false, reason: "Não há ledger de entradas/ajustes nem limite confiável de estoque baixo.", products: inventoryProducts, outOfStockProducts: inventoryProducts.filter((product) => product.active && product.stock === 0).length },
    attendanceMetrics: { available: false, reason: "Não existe estrutura de frequência escolar; ausência de pontos não é falta." },
  };
}

export async function closeWeeklyReport(db: Db, schoolId: ObjectId, period = latestEligiblePeriod(), now = new Date(), generatedBy: "automatic" | "recovery" = generationMode(now)) {
  const reports = db.collection<WeeklyReportDbDocument>("weeklyReports");
  const documentId = reportDocumentId(schoolId.toString(), period.weekStart);
  const existing = await reports.findOne({ _id: documentId, schoolId });
  if (existing) return { created: false, report: existing };
  const snapshot = await buildWeeklyReportSnapshot(db, schoolId, period, now, generatedBy);
  try {
    await reports.insertOne(snapshot);
    return { created: true, report: snapshot };
  } catch (error) {
    if (error instanceof Error && ("code" in error && error.code === 11000 || error.message.includes("E11000"))) {
      const concurrent = await reports.findOne({ _id: documentId, schoolId });
      if (concurrent) return { created: false, report: concurrent };
    }
    throw error;
  }
}

export async function closeLatestEligibleReports(db: Db, now = new Date()) {
  const latestPeriod = latestEligiblePeriod(now); const currentMode = generationMode(now);
  const schools = await db.collection("schools").find({ active: { $ne: false }, status: { $ne: "archived" }, companyId: { $type: "objectId" } }, { projection: { _id: 1 } }).toArray();
  const results = [];
  for (const school of schools) {
    const last = await db.collection("weeklyReports").find({ schoolId: school._id, status: "CLOSED" }, { projection: { weekStart: 1 } }).sort({ weekStart: -1 }).limit(1).next();
    const starts: string[] = [];
    if (typeof last?.weekStart === "string" && last.weekStart < latestPeriod.weekStart) {
      for (let cursor = addCivilDays(last.weekStart, 7); cursor <= latestPeriod.weekStart && starts.length < 12; cursor = addCivilDays(cursor, 7)) starts.push(cursor);
    } else if (!last || last.weekStart === latestPeriod.weekStart) starts.push(latestPeriod.weekStart);
    for (const weekStart of starts) {
      try {
        const mode = weekStart === latestPeriod.weekStart ? currentMode : "recovery";
        const result = await closeWeeklyReport(db, school._id, periodForWeekStart(weekStart), now, mode);
        results.push({ schoolId: school._id.toString(), weekStart, created: result.created, generatedBy: mode });
      } catch { results.push({ schoolId: school._id.toString(), weekStart, created: false, error: "REPORT_GENERATION_FAILED" }); }
    }
  }
  return { eligibleThroughWeekStart: latestPeriod.weekStart, eligibleThroughWeekEnd: latestPeriod.weekEnd, results };
}
