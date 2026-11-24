import { lockCategorySchool, CategoryConflict, operationalCategories } from "@/lib/category-management";
import { summarizeAttendanceByClasses, type AttendanceSession } from "@/lib/attendance-core";
import { ObjectId, type Db, type Document } from "mongodb";
import { getCategoryScopeFilter } from "@/lib/category-scope";
import { getEffectiveSchoolScoringMode } from "@/lib/school-scoring-mode";
import { type ActivityRecord, type WeeklyScoreLedger } from "@/lib/activity-persistence-types";
import { COLLABORATOR_COLLECTIONS } from "@/lib/collaborator-development";
import { LEARNING_COLLECTIONS } from "@/lib/learning-rhythm-model";
import { calculateLearningRhythm } from "@/lib/learning-rhythm";
import {
  WEEKLY_REPORT_TIME_ZONE,
  WEEKLY_REPORT_FIRST_PROTECTED_WEEK,
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
  scheduledCloseAt,
  type EvolutionStatus,
  type WeeklyReportPeriod,
} from "@/lib/weekly-management-report-core";

const SCHOOL_ID = (schoolId: ObjectId) => ({ $in: [schoolId, schoolId.toString()] });
const id = (value: unknown) => value instanceof ObjectId ? value.toString() : String(value || "");
const name = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const dateBefore = (value: unknown, boundary: Date) => !(value instanceof Date) || value < boundary;

type ActivityCounts = { approvedActivities: number; pendingActivities: number; correctedActivities: number; rejectedActivities: number };
type CategoryRow = ActivityCounts & { categoryId: string; categoryName: string; goal: number; realized: number; creditedPoints: number; performancePercentage: number | null; goalReached: boolean | null; applicable: boolean };
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

const emptyActivityCounts = (): ActivityCounts => ({ approvedActivities: 0, pendingActivities: 0, correctedActivities: 0, rejectedActivities: 0 });

function activityCounts(records: ActivityRecord[]): Map<string, ActivityCounts> {
  const totals = new Map<string, ActivityCounts>();
  for (const record of records) {
    const key = `${record.studentId}:${record.categoryId}`;
    const counts = totals.get(key) || emptyActivityCounts();
    if (record.status === "approved") counts.approvedActivities += 1;
    else if (record.status === "pending") counts.pendingActivities += 1;
    else if (record.status === "corrected") counts.correctedActivities += 1;
    else if (record.status === "rejected") counts.rejectedActivities += 1;
    totals.set(key, counts);
  }
  return totals;
}

function ledgerByStudentCategory(ledgers: WeeklyScoreLedger[]): Map<string, WeeklyScoreLedger> {
  return new Map(ledgers.map((ledger) => [`${ledger.studentId}:${ledger.categoryId}`, ledger]));
}

function sumActivityCounts(rows: Array<Partial<ActivityCounts>>): ActivityCounts {
  return rows.reduce<ActivityCounts>((total, row) => ({
    approvedActivities: total.approvedActivities + (row.approvedActivities || 0),
    pendingActivities: total.pendingActivities + (row.pendingActivities || 0),
    correctedActivities: total.correctedActivities + (row.correctedActivities || 0),
    rejectedActivities: total.rejectedActivities + (row.rejectedActivities || 0),
  }), emptyActivityCounts());
}

export async function buildWeeklyReportSnapshot(db: Db, schoolId: ObjectId, period: WeeklyReportPeriod, now = new Date(), generatedBy: "automatic" | "recovery" = generationMode(now)) {
  // A ausência de pontos não é falta; apenas chamadas explícitas compõem o snapshot.
  const attendanceSessions = await db.collection("attendanceSessions").find({ schoolId: SCHOOL_ID(schoolId), date: { $gte: period.weekStart, $lte: period.weekEnd }, $or: [{ status: "FINALIZED" }, { status: { $exists: false } }] }).toArray();
  const previous = periodForWeekStart(addCivilDays(period.weekStart, -7));
  const school = await db.collection("schools").findOne({ _id: schoolId });
  if (!school) throw new Error("SCHOOL_NOT_FOUND");
  if (!(school.companyId instanceof ObjectId)) throw new Error("SCHOOL_WITHOUT_COMPANY");
  const company = await db.collection("companies").findOne({ _id: school.companyId }, { projection: { tradeName: 1, legalName: 1 } });
  const [scoringMode, previousScoringMode] = await Promise.all([
    getEffectiveSchoolScoringMode(db, schoolId, period.startAt),
    getEffectiveSchoolScoringMode(db, schoolId, previous.startAt),
  ]);

  const [students, educators, classes, categoryDocuments, redemptions, referrals, pointProducts, superaProducts] = await Promise.all([
    db.collection("users").find({ role: "student", schoolId: SCHOOL_ID(schoolId), active: { $ne: false }, $or: [{ createdAt: { $lt: period.nextWeekStartAt } }, { createdAt: { $exists: false } }] }, { projection: { name: 1, createdAt: 1 } }).toArray(),
    db.collection("users").find({ role: "educator", schoolId: SCHOOL_ID(schoolId), active: { $ne: false } }, { projection: { name: 1 } }).toArray(),
    db.collection("classes").find({ schoolId: SCHOOL_ID(schoolId), active: { $ne: false } }, { projection: { name: 1, educatorId: 1, studentIds: 1 } }).toArray(),
    db.collection("categories").find({ $and: [getCategoryScopeFilter(schoolId), { participatesInRanking: true }] }, { projection: { name: 1, schoolId: 1, weeklyGoal: 1, createdAt: 1, active: 1 } }).toArray(),
    db.collection("pointStoreRedemptions").find({ schoolId: SCHOOL_ID(schoolId), createdAt: { $gte: period.startAt, $lt: period.nextWeekStartAt } }).toArray(),
    db.collection("referrals").find({ schoolId: SCHOOL_ID(schoolId), createdAt: { $gte: period.startAt, $lt: period.nextWeekStartAt } }).toArray(),
    db.collection("pointStoreProducts").find({ schoolId: SCHOOL_ID(schoolId) }, { projection: { name: 1, stock: 1, active: 1 } }).toArray(),
    db.collection("productsSupera").find({ schoolId: SCHOOL_ID(schoolId) }, { projection: { name: 1, stock: 1, active: 1 } }).toArray(),
  ]);

  // pointEvents antigos nem sempre possuem schoolId; o conjunto de alunos da escola é a fronteira confiável.
  const studentIds = students.map((student) => student._id);
  const [scopedEvents, scoreLedgers, activityRecords] = await Promise.all([
    studentIds.length ? db.collection("pointEvents").find({ studentId: { $in: studentIds }, createdAt: { $gte: previous.startAt, $lt: period.nextWeekStartAt } }).toArray() : [],
    scoringMode === "automatic" || previousScoringMode === "automatic"
      ? db.collection<WeeklyScoreLedger>("weeklyScoreLedgers").find({ schoolId, studentId: { $in: studentIds }, weekStart: { $in: [previous.weekStart, period.weekStart] } }).toArray()
      : [],
    scoringMode === "automatic"
      ? db.collection<ActivityRecord>("activityRecords").find({ schoolId, studentId: { $in: studentIds }, weekStart: period.weekStart }).toArray()
      : [],
  ]);
  const currentEvents = scopedEvents.filter((event) => event.createdAt instanceof Date && event.createdAt >= period.startAt);
  const previousEvents = scopedEvents.filter((event) => event.createdAt instanceof Date && event.createdAt < period.startAt);
  const currentTotals = sumEvents(currentEvents);
  const previousTotals = sumEvents(previousEvents);
  const currentLedgers = scoreLedgers.filter((ledger) => ledger.weekStart === period.weekStart);
  const previousLedgers = scoreLedgers.filter((ledger) => ledger.weekStart === previous.weekStart);
  const currentLedgerMap = ledgerByStudentCategory(currentLedgers);
  const previousLedgerMap = ledgerByStudentCategory(previousLedgers);
  const currentActivityCounts = activityCounts(activityRecords);
  const activeCategories = (await operationalCategories(db, schoolId, categoryDocuments)).filter((category) => Number(category.weeklyGoal) > 0 && category.participatesInRanking !== false);
  const ledgerCategoryIds = new Set(currentLedgers.map((ledger) => id(ledger.categoryId)));
  const categoriesById = new Map(categoryDocuments.filter((category) => ledgerCategoryIds.has(id(category._id))).map((category) => [id(category._id), category]));
  for (const category of activeCategories) categoriesById.set(id(category._id), category);
  const categories = [...categoriesById.values()];

  const classesByStudent = new Map<string, Document[]>();
  for (const classItem of classes) for (const studentId of Array.isArray(classItem.studentIds) ? classItem.studentIds : []) {
    const key = id(studentId); if (!key) continue;
    classesByStudent.set(key, [...(classesByStudent.get(key) || []), classItem]);
  }

  const studentMetrics: StudentMetric[] = students.map((student) => {
    const studentKey = id(student._id);
    const previousStudentApplicable = dateBefore(student.createdAt, period.startAt);
    const categoryMetrics = categories.map((category) => {
      const categoryKey = id(category._id);
      const metricKey = `${studentKey}:${categoryKey}`;
      const currentLedger = currentLedgerMap.get(metricKey);
      const previousLedger = previousLedgerMap.get(metricKey);
      const counts = currentActivityCounts.get(metricKey) || emptyActivityCounts();
      const goal = scoringMode === "automatic" ? Number(currentLedger?.configurationSnapshot.targetQuantity ?? category.weeklyGoal) : Number(category.weeklyGoal);
      const currentApplicable = dateBefore(category.createdAt, period.nextWeekStartAt);
      const previousApplicable = previousStudentApplicable && dateBefore(category.createdAt, period.startAt);
      const realized = scoringMode === "automatic" ? Number(currentLedger?.approvedQuantity || 0) : currentTotals.get(metricKey) || 0;
      const previousRealized = scoringMode === "automatic"
        ? previousScoringMode === "automatic" && previousApplicable && previousLedger ? Number(previousLedger.approvedQuantity) : null
        : previousScoringMode === "legacy" && previousApplicable ? previousTotals.get(metricKey) || 0 : null;
      const previousGoal = scoringMode === "automatic" ? Number(previousLedger?.configurationSnapshot.targetQuantity || 0) : goal;
      const currentPerformance = currentApplicable ? performancePercentage(realized, goal) : null;
      const previousPerformance = previousApplicable && previousRealized !== null ? performancePercentage(previousRealized, previousGoal) : null;
      return {
        categoryId: categoryKey, categoryName: name(category.name, "Categoria"), goal, realized,
        creditedPoints: scoringMode === "automatic" ? Number(currentLedger?.creditedPoints || 0) : realized,
        ...counts, performancePercentage: currentPerformance,
        goalReached: currentPerformance === null ? null : currentPerformance >= 100,
        applicable: currentApplicable, previousRealized, previousPerformancePercentage: previousPerformance,
        ...classifyEvolution(currentPerformance, previousPerformance),
      };
    });
    const comparable = categoryMetrics.filter((metric) => metric.performancePercentage !== null && metric.previousPerformancePercentage !== null);
    const currentAverage = average(comparable.map((metric) => metric.performancePercentage!));
    const previousAverage = average(comparable.map((metric) => metric.previousPerformancePercentage!));
    const studentClasses = classesByStudent.get(studentKey) || [];
    return {
      studentId: studentKey, studentName: name(student.name, "Aluno"), classIds: studentClasses.map((item) => id(item._id)), classNames: studentClasses.map((item) => name(item.name, "Turma")), categoryMetrics,
      performancePercentage: currentAverage, previousPerformancePercentage: previousAverage,
      goalReached: categoryMetrics.some((metric) => metric.goalReached === true), ...classifyEvolution(currentAverage, previousAverage),
      hasPedagogicalRecords: scoringMode === "automatic"
        ? activityRecords.some((activity) => id(activity.studentId) === studentKey)
        : currentEvents.some((event) => id(event.studentId) === studentKey && event.categoryId instanceof ObjectId && event.source !== "special_bonus"),
    };
  });

  const statusCount = (status: EvolutionStatus) => studentMetrics.filter((student) => student.evolutionStatus === status).length;
  const comparableStudents = studentMetrics.length - statusCount("INSUFFICIENT_DATA");
  const evolvedStudents = statusCount("EVOLVED");
  const studentsWithRecords = studentMetrics.filter((student) => student.hasPedagogicalRecords).length;

  const categoryMetrics = categories.map((category) => {
    const rows = studentMetrics.map((student) => student.categoryMetrics.find((metric) => metric.categoryId === id(category._id))!).filter(Boolean);
    const categoryLedger = currentLedgers.find((ledger) => id(ledger.categoryId) === id(category._id));
    const comparable = rows.filter((row) => row.evolutionStatus !== "INSUFFICIENT_DATA");
    const evolved = comparable.filter((row) => row.evolutionStatus === "EVOLVED").length;
    const goalReached = rows.filter((row) => row.goalReached === true).length;
    const counts = sumActivityCounts(rows);
    return { categoryId: id(category._id), categoryName: name(category.name, "Categoria"), weeklyGoal: scoringMode === "automatic" ? Number(categoryLedger?.configurationSnapshot.targetQuantity ?? category.weeklyGoal) : Number(category.weeklyGoal), approvedQuantity: rows.reduce((total, row) => total + row.realized, 0), creditedPoints: rows.reduce((total, row) => total + row.creditedPoints, 0), ...counts, comparableStudents: comparable.length, evolvedStudents: evolved, maintainedStudents: comparable.filter((row) => row.evolutionStatus === "MAINTAINED").length, declinedStudents: comparable.filter((row) => row.evolutionStatus === "DECLINED").length, insufficientDataStudents: rows.length - comparable.length, evolvedPercentage: percentage(evolved, comparable.length), goalReachedStudents: goalReached, goalReachedPercentage: percentage(goalReached, rows.filter((row) => row.applicable).length) };
  });

  const metricForGroup = (memberIds: string[]) => {
    const members = studentMetrics.filter((student) => memberIds.includes(student.studentId));
    const comparable = members.filter((student) => student.evolutionStatus !== "INSUFFICIENT_DATA");
    const rows = members.flatMap((student) => student.categoryMetrics);
    return { students: members.length, studentsWithRecords: members.filter((student) => student.hasPedagogicalRecords).length, pedagogicalCoveragePercentage: percentage(members.filter((student) => student.hasPedagogicalRecords).length, members.length), approvedQuantity: rows.reduce((total, row) => total + row.realized, 0), creditedPoints: rows.reduce((total, row) => total + row.creditedPoints, 0), ...sumActivityCounts(rows), goalReachedStudents: members.filter((student) => student.goalReached).length, comparableStudents: comparable.length, evolvedStudents: comparable.filter((student) => student.evolutionStatus === "EVOLVED").length, maintainedStudents: comparable.filter((student) => student.evolutionStatus === "MAINTAINED").length, declinedStudents: comparable.filter((student) => student.evolutionStatus === "DECLINED").length };
  };

  const baseClassMetrics = classes.map((classItem) => ({ classId: id(classItem._id), className: name(classItem.name, "Turma"), educatorId: id(classItem.educatorId) || null, educatorName: educators.find((item) => id(item._id) === id(classItem.educatorId)) ? name(educators.find((item) => id(item._id) === id(classItem.educatorId))!.name, "Educador") : null, ...metricForGroup((Array.isArray(classItem.studentIds) ? classItem.studentIds : []).map(id)) }));
  const attendanceMetrics = summarizeAttendanceByClasses(attendanceSessions as unknown as AttendanceSession[], classes.map((classItem) => {
    const educator = educators.find((item) => id(item._id) === id(classItem.educatorId));
    return { classId: id(classItem._id), className: name(classItem.name, "Turma"), educatorId: id(classItem.educatorId) || null, educatorName: educator ? name(educator.name, "Educador") : null };
  }));
  const classMetrics = baseClassMetrics.map((item) => {
    const attendance = attendanceMetrics.classAttendance.find((row) => row.classId === item.classId);
    return { ...item, attendance: attendance && attendance.opportunities > 0 ? { assessed: attendance.opportunities, presences: attendance.presences, absences: attendance.absences, frequencyPercentage: attendance.percentage, absencePercentage: attendance.absences / attendance.opportunities * 100 } : { assessed: 0, presences: 0, absences: 0, frequencyPercentage: null, absencePercentage: null } };
  });
  const educatorMetrics = educators.map((educator) => {
    const educatorClasses = classes.filter((item) => id(item.educatorId) === id(educator._id));
    const memberIds = [...new Set(educatorClasses.flatMap((item) => (Array.isArray(item.studentIds) ? item.studentIds : []).map(id)))];
    const educatorId = id(educator._id);
    const educatorEvents = currentEvents.filter((event) => id(event.educatorId || event.awardedBy) === educatorId && event.categoryId instanceof ObjectId && event.source !== "special_bonus");
    const educatorActivities = activityRecords.filter((activity) => id(activity.reviewedByEducatorId) === educatorId);
    const workedCategoryIds = scoringMode === "automatic" ? educatorActivities.map((activity) => id(activity.categoryId)) : educatorEvents.map((event) => id(event.categoryId));
    const educatorClassIds = new Set(educatorClasses.map((item) => id(item._id)));
    const attendance = attendanceMetrics.classAttendance.filter((item) => educatorClassIds.has(item.classId));
    return { educatorId, educatorName: name(educator.name, "Educador"), classIds: educatorClasses.map((item) => id(item._id)), classNames: educatorClasses.map((item) => name(item.name, "Turma")), categoriesWorked: [...new Set(workedCategoryIds)].length, recordCount: scoringMode === "automatic" ? educatorActivities.length : educatorEvents.length, absences: attendanceMetrics.absentees.filter((item) => item.educatorId === educatorId).length, attendanceSessions: attendance.reduce((total, item) => total + item.totalSessions, 0), pendingAttendanceSessions: null, ...metricForGroup(memberIds) };
  });

  const inventoryProducts = [...pointProducts.map((product) => ({ source: "point_store", productId: id(product._id), productName: name(product.name, "Produto"), stock: Number(product.stock || 0), active: product.active !== false })), ...superaProducts.map((product) => ({ source: "products_supera", productId: id(product._id), productName: name(product.name, "Produto"), stock: Number(product.stock || 0), active: product.active !== false }))];
  const pedagogicalEvents = currentEvents.filter((event) => event.categoryId instanceof ObjectId && event.source !== "special_bonus" && Number(event.points) > 0);
  const specialBonusPoints = currentEvents.filter((event) => event.source === "special_bonus").reduce((total, event) => total + Number(event.points || 0), 0);
  const allCategoryRows = studentMetrics.flatMap((student) => student.categoryMetrics);
  const unitActivityCounts = sumActivityCounts(allCategoryRows);
  const pointsAwarded = scoringMode === "automatic"
    ? currentLedgers.reduce((total, ledger) => total + Number(ledger.creditedPoints || 0), 0)
    : pedagogicalEvents.reduce((total, event) => total + Number(event.points || 0), 0);

  // Snapshot separado: nunca mistura colaboradores com métricas/rankings de alunos.
  let collaboratorClasses: Document[] = [], collaboratorAssignments: Document[] = [], collaboratorActivities: Document[] = [];
  try {
    [collaboratorClasses, collaboratorAssignments, collaboratorActivities] = await Promise.all([
      db.collection(COLLABORATOR_COLLECTIONS.classes).find({ schoolId, active: { $ne: false }, createdAt: { $lt: period.nextWeekStartAt } }).toArray(),
      db.collection(COLLABORATOR_COLLECTIONS.assignments).find({ schoolId, active: { $ne: false }, createdAt: { $lt: period.nextWeekStartAt } }).toArray(),
      db.collection(COLLABORATOR_COLLECTIONS.activities).find({ schoolId, activityAt: { $lt: period.nextWeekStartAt } }).toArray(),
    ]);
  } catch { /* Compatibilidade com adaptadores legados sem as novas coleções. */ }
  const collaboratorIds = [...new Set(collaboratorClasses.flatMap((item) => item.participantIds ?? []).map(String))];
  const collaboratorUsers = collaboratorIds.length ? await db.collection("users").find({ _id: { $in: collaboratorIds.filter(ObjectId.isValid).map((value) => new ObjectId(value)) } }, { projection: { role: 1 } }).toArray() : [];
  let collaboratorBooks: Document[] = [];
  try { collaboratorBooks = collaboratorAssignments.length ? await db.collection(LEARNING_COLLECTIONS.books).find({ _id: { $in: collaboratorAssignments.map((item) => item.bookId) }, schoolId }).toArray() : []; } catch { collaboratorBooks = []; }
  const collaboratorBookMap = new Map(collaboratorBooks.map((item) => [String(item._id), item]));
  const collaboratorRhythms = collaboratorAssignments.flatMap((assignment) => { const book = collaboratorBookMap.get(String(assignment.bookId)); return book ? [calculateLearningRhythm({ startDate: assignment.startDate, totalQuestions: book.totalQuestions, completedQuestions: assignment.completedQuestions ?? 0, studyDaysPerWeek: assignment.studyDaysPerWeek, pauses: assignment.pauses ?? [], asOf: period.weekEnd })] : []; });
  const collaboratorDevelopmentMetrics = {
    participants: collaboratorIds.length, educators: collaboratorUsers.filter((item) => item.role === "educator").length,
    administrators: collaboratorUsers.filter((item) => item.role !== "educator").length,
    booksInProgress: collaboratorRhythms.filter((item) => item.remainingQuestions > 0).length, booksCompleted: collaboratorRhythms.filter((item) => item.remainingQuestions === 0).length,
    approvedQuestions: collaboratorActivities.reduce((total, item) => total + Number(item.approvedQuantity ?? 0), 0), pendingActivities: collaboratorActivities.filter((item) => item.status === "pending").length,
    pointsReceived: collaboratorActivities.reduce((total, item) => total + Number(item.pointsGranted ?? 0), 0), attentionBooks: collaboratorRhythms.filter((item) => !["regular", "insufficient_data"].includes(item.status)).length,
    aboveDesiredTerm: collaboratorRhythms.filter((item) => ["desired_exceeded", "administrative_limit_exceeded"].includes(item.status)).length, aboveAdministrativeLimit: collaboratorRhythms.filter((item) => item.status === "administrative_limit_exceeded").length,
  };

  return {
    _id: reportDocumentId(schoolId.toString(), period.weekStart), companyId: school.companyId, schoolId,
    companyName: company ? name(company.tradeName || company.legalName, "Empresa") : null, schoolName: name(school.name, "Unidade"), weekStart: period.weekStart, weekEnd: period.weekEnd,
    periodStartAt: period.startAt, nextWeekStartAt: period.nextWeekStartAt, scheduledCloseAt: scheduledCloseAt(period), executedAt: now, closedAt: now, status: "CLOSED", reportVersion: WEEKLY_REPORT_VERSION, generatedBy, timezone: WEEKLY_REPORT_TIME_ZONE, scoringMode,
    summary: { activeStudents: students.length, activeEducators: educators.length, activeClasses: classes.length, pointsAwarded, specialBonusPoints, approvedQuantity: allCategoryRows.reduce((total, row) => total + row.realized, 0), pendingActivities: unitActivityCounts.pendingActivities, approvedActivities: unitActivityCounts.approvedActivities, correctedActivities: unitActivityCounts.correctedActivities, rejectedActivities: unitActivityCounts.rejectedActivities, pointsRedeemed: redemptions.reduce((total, item) => total + Number(item.pointsSpent || 0), 0), redemptions: redemptions.length, comparableStudents, evolvedStudents, maintainedStudents: statusCount("MAINTAINED"), declinedStudents: statusCount("DECLINED"), insufficientDataStudents: statusCount("INSUFFICIENT_DATA"), evolvedAmongAllActiveStudentsPercentage: percentage(evolvedStudents, students.length), evolvedAmongComparableStudentsPercentage: percentage(evolvedStudents, comparableStudents), studentsWithPedagogicalRecords: studentsWithRecords, studentsWithoutPedagogicalRecords: students.length - studentsWithRecords, pedagogicalCoveragePercentage: percentage(studentsWithRecords, students.length) },
    studentMetrics, categoryMetrics, educatorMetrics, classMetrics, collaboratorDevelopmentMetrics,
    referralMetrics: { available: true, total: referrals.length, byStatus: countStatuses(referrals, "status"), byAttendanceStatus: countStatuses(referrals, "attendanceStatus") },
    salesMetrics: { available: false, reason: "O sistema não persiste vendas concluídas; o contato via WhatsApp não comprova uma venda." },
    redemptionMetrics: { available: true, count: redemptions.length, pointsSpent: redemptions.reduce((total, item) => total + Number(item.pointsSpent || 0), 0), items: redemptions.map((item) => ({ redemptionId: id(item._id), studentId: id(item.studentId), productId: id(item.productId), productName: name(item.productName, "Produto"), pointsSpent: Number(item.pointsSpent || 0), status: name(item.status, "unknown"), createdAt: item.createdAt })) },
    inventoryMetrics: { available: true, snapshotOnly: true, movementAvailable: false, lowStockAvailable: false, reason: "Não há ledger de entradas/ajustes nem limite confiável de estoque baixo.", products: inventoryProducts, outOfStockProducts: inventoryProducts.filter((product) => product.active && product.stock === 0).length },
    attendancePolicySnapshot: (() => { const policy = (Array.isArray(school.frequencyConfigurations) ? school.frequencyConfigurations : []).find((item: { year?: number }) => item.year === Number(period.weekStart.slice(0, 4))); return policy ? { maximumAbsencePercentage: Number(policy.maximumAbsencePercentage), minimumFrequencyPercentage: 100 - Number(policy.maximumAbsencePercentage) } : null; })(),
    attendanceMetrics: { ...attendanceMetrics, detailsSource: "SNAPSHOT", unidentifiedAbsences: attendanceMetrics.absentees.filter((item) => !item.educatorId).length },
  };
}

export async function closeWeeklyReport(db: Db, schoolId: ObjectId, period = latestEligiblePeriod(), now = new Date(), generatedBy: "automatic" | "recovery" = generationMode(now)) {
  const reports = db.collection<WeeklyReportDbDocument>("weeklyReports");
  const documentId = reportDocumentId(schoolId.toString(), period.weekStart);
  const existing = await reports.findOne({ _id: documentId, schoolId });
  if (existing) return { created: false, report: existing };
  const snapshot = await buildWeeklyReportSnapshot(db, schoolId, period, now, generatedBy);
  try {
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await lockCategorySchool(db, schoolId, session);
        for (const metric of snapshot.categoryMetrics) {
          const category = await db.collection("categories").findOne({ _id: new ObjectId(metric.categoryId) }, { session });
          if (!category) throw new CategoryConflict("Uma categoria mudou durante o fechamento. Tente novamente.");
        }
        await reports.insertOne(snapshot, { session });
      });
    } finally { await session.endSession(); }
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
      for (let cursor = addCivilDays(last.weekStart, 7); cursor <= latestPeriod.weekStart && starts.length < 12; cursor = addCivilDays(cursor, 7)) {
        if (cursor >= WEEKLY_REPORT_FIRST_PROTECTED_WEEK) starts.push(cursor);
      }
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
