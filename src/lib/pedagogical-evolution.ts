import type { EvolutionStatus, StudentMetric, WeeklyReport } from "./weekly-management-report-types";

export const PEDAGOGICAL_STABILITY_MARGIN_PP = 10;
export const PEDAGOGICAL_HISTORY_WEEKS = 12;
export const PEDAGOGICAL_MAX_HISTORY_WEEKS = 104;

export type PedagogicalHistoryPoint = { weekStart: string; percentage: number | null; deltaPercentagePoints: number | null };

export type AttentionStatus =
  | "EVOLUTION"
  | "STABLE"
  | "PREVENTIVE_ATTENTION"
  | "PRIORITY_ATTENTION"
  | "INDIVIDUAL_FOLLOW_UP"
  | "RECOVERING"
  | "INSUFFICIENT_DATA";

export type PedagogicalFilters = {
  studentId?: string;
  educatorId?: string;
  classId?: string;
  categoryId?: string;
  search?: string;
  situation?: AttentionStatus | "ALL";
};

export type EvolutionStudent = {
  studentId: string;
  studentName: string;
  classIds: string[];
  classNames: string[];
  educatorIds: string[];
  educatorNames: string[];
  previousPercentage: number | null;
  currentPercentage: number | null;
  deltaPercentagePoints: number | null;
  evolutionStatus: EvolutionStatus;
  attentionStatus: AttentionStatus;
  declineStreak: number;
  categoryMetrics: StudentMetric["categoryMetrics"];
  history: PedagogicalHistoryPoint[];
  categoryHistory: Record<string, PedagogicalHistoryPoint[]>;
};

export type EvolutionGroup = {
  id: string;
  name: string;
  classIds: string[];
  classNames: string[];
  students: number;
  comparableStudents: number;
  previousGoalRate: number | null;
  currentGoalRate: number | null;
  deltaPercentagePoints: number | null;
  evolvedStudents: number;
  maintainedStudents: number;
  declinedStudents: number;
  insufficientDataStudents: number;
  history: PedagogicalHistoryPoint[];
  categoryMetrics: Array<{ categoryId: string; categoryName: string; previousGoalRate: number | null; currentGoalRate: number | null; deltaPercentagePoints: number | null }>;
};

const percent = (part: number, total: number) => total > 0 ? part / total * 100 : null;
const cap = (value: number | null) => value === null ? null : Math.min(100, Math.max(0, value));
const mean = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

export function classifyPedagogicalDelta(delta: number | null): EvolutionStatus {
  if (delta === null) return "INSUFFICIENT_DATA";
  if (delta >= PEDAGOGICAL_STABILITY_MARGIN_PP) return "EVOLVED";
  if (delta <= -PEDAGOGICAL_STABILITY_MARGIN_PP) return "DECLINED";
  return "MAINTAINED";
}

function studentPercentage(student: StudentMetric | undefined, categoryId?: string) {
  if (!student) return null;
  const values = student.categoryMetrics
    .filter((metric) => !categoryId || metric.categoryId === categoryId)
    .map((metric) => cap(metric.performancePercentage))
    .filter((value): value is number => value !== null);
  return mean(values);
}

function studentPreviousPercentage(student: StudentMetric, categoryId?: string) {
  const values = student.categoryMetrics
    .filter((metric) => !categoryId || metric.categoryId === categoryId)
    .map((metric) => cap(metric.previousPerformancePercentage))
    .filter((value): value is number => value !== null);
  return mean(values);
}

function declineStreak(studentId: string, reports: WeeklyReport[], categoryId?: string) {
  let streak = 0;
  for (const report of reports) {
    const student = report.studentMetrics.find((item) => item.studentId === studentId);
    const current = studentPercentage(student, categoryId);
    const previous = student ? studentPreviousPercentage(student, categoryId) : null;
    if (current === null || previous === null) break;
    if (current - previous <= -PEDAGOGICAL_STABILITY_MARGIN_PP) streak += 1;
    else break;
  }
  return streak;
}

function attentionStatus(status: EvolutionStatus, streak: number, hadPriorAttention: boolean): AttentionStatus {
  if (status === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  if (status === "EVOLVED") return hadPriorAttention ? "RECOVERING" : "EVOLUTION";
  if (status === "MAINTAINED") return "STABLE";
  if (streak >= 3) return "INDIVIDUAL_FOLLOW_UP";
  if (streak === 2) return "PRIORITY_ATTENTION";
  return "PREVENTIVE_ATTENTION";
}

function goalRate(students: EvolutionStudent[], categoryId?: string, previous = false) {
  const opportunities = students.flatMap((student) => student.categoryMetrics.filter((metric) => (!categoryId || metric.categoryId === categoryId) && metric.performancePercentage !== null && metric.previousPerformancePercentage !== null));
  return percent(opportunities.filter((metric) => cap(previous ? metric.previousPerformancePercentage : metric.performancePercentage)! >= 100).length, opportunities.length);
}

function groupMetric(id: string, name: string, classIds: string[], classNames: string[], students: EvolutionStudent[], history: PedagogicalHistoryPoint[]): EvolutionGroup {
  const comparable = students.filter((student) => student.deltaPercentagePoints !== null);
  const opportunities = students.flatMap((student) => student.categoryMetrics.filter((metric) => metric.performancePercentage !== null && metric.previousPerformancePercentage !== null));
  const currentReached = opportunities.filter((metric) => cap(metric.performancePercentage)! >= 100).length;
  const previousReached = opportunities.filter((metric) => cap(metric.previousPerformancePercentage)! >= 100).length;
  const currentGoalRate = percent(currentReached, opportunities.length);
  const previousGoalRate = percent(previousReached, opportunities.length);
  return {
    id, name, classIds, classNames, students: students.length,
    comparableStudents: comparable.length,
    previousGoalRate, currentGoalRate,
    deltaPercentagePoints: currentGoalRate === null || previousGoalRate === null ? null : currentGoalRate - previousGoalRate,
    evolvedStudents: comparable.filter((student) => student.evolutionStatus === "EVOLVED").length,
    maintainedStudents: comparable.filter((student) => student.evolutionStatus === "MAINTAINED").length,
    declinedStudents: comparable.filter((student) => student.evolutionStatus === "DECLINED").length,
    insufficientDataStudents: students.length - comparable.length,
    history,
    categoryMetrics: [...new Map(students.flatMap((student) => student.categoryMetrics.map((metric) => [metric.categoryId, metric.categoryName] as const))).entries()].map(([categoryId, categoryName]) => {
      const current = goalRate(students, categoryId);
      const prior = goalRate(students, categoryId, true);
      return { categoryId, categoryName, previousGoalRate: prior, currentGoalRate: current, deltaPercentagePoints: current === null || prior === null ? null : current - prior };
    }),
  };
}

function buildGroupHistory(reports: WeeklyReport[], educatorId?: string, classId?: string, categoryId?: string): PedagogicalHistoryPoint[] {
  const chronological = [...reports].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return chronological.map((report, index) => {
    const eligibleClasses = new Set(report.classMetrics.filter((item) => (!educatorId || item.educatorId === educatorId) && (!classId || item.classId === classId)).map((item) => item.classId));
    const opportunities = report.studentMetrics.filter((student) => student.classIds.some((id) => eligibleClasses.has(id))).flatMap((student) => student.categoryMetrics.filter((metric) => (!categoryId || metric.categoryId === categoryId) && metric.performancePercentage !== null));
    const percentage = percent(opportunities.filter((metric) => cap(metric.performancePercentage)! >= 100).length, opportunities.length);
    const previousPercentage = index > 0 ? chronological[index - 1] : null;
    if (!previousPercentage || percentage === null) return { weekStart: report.weekStart, percentage, deltaPercentagePoints: null };
    const priorClasses = new Set(previousPercentage.classMetrics.filter((item) => (!educatorId || item.educatorId === educatorId) && (!classId || item.classId === classId)).map((item) => item.classId));
    const priorOpportunities = previousPercentage.studentMetrics.filter((student) => student.classIds.some((id) => priorClasses.has(id))).flatMap((student) => student.categoryMetrics.filter((metric) => (!categoryId || metric.categoryId === categoryId) && metric.performancePercentage !== null));
    const priorRate = percent(priorOpportunities.filter((metric) => cap(metric.performancePercentage)! >= 100).length, priorOpportunities.length);
    return { weekStart: report.weekStart, percentage, deltaPercentagePoints: priorRate === null ? null : percentage - priorRate };
  });
}

export function buildPedagogicalEvolution(reports: WeeklyReport[], filters: PedagogicalFilters = {}) {
  const ordered = [...reports].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const current = ordered[0];
  if (!current) return null;
  const previous = ordered[1] ?? null;
  const classes = current.classMetrics;
  const classById = new Map(classes.map((item) => [item.classId, item]));
  const allowedClassIds = new Set(classes.filter((item) => (!filters.educatorId || item.educatorId === filters.educatorId) && (!filters.classId || item.classId === filters.classId)).map((item) => item.classId));
  const search = filters.search?.trim().toLocaleLowerCase("pt-BR") ?? "";

  const students: EvolutionStudent[] = current.studentMetrics.flatMap((student) => {
    if (filters.studentId && student.studentId !== filters.studentId) return [];
    const scopedClassIds = student.classIds.filter((classId) => allowedClassIds.has(classId));
    if ((filters.educatorId || filters.classId) && scopedClassIds.length === 0) return [];
    if (search && !student.studentName.toLocaleLowerCase("pt-BR").includes(search)) return [];
    const categories = student.categoryMetrics.filter((metric) => !filters.categoryId || metric.categoryId === filters.categoryId);
    const currentPercentage = mean(categories.map((metric) => cap(metric.performancePercentage)).filter((value): value is number => value !== null));
    const previousPercentage = mean(categories.map((metric) => cap(metric.previousPerformancePercentage)).filter((value): value is number => value !== null));
    const delta = currentPercentage === null || previousPercentage === null ? null : currentPercentage - previousPercentage;
    const evolutionStatus = classifyPedagogicalDelta(delta);
    const streak = declineStreak(student.studentId, ordered, filters.categoryId);
    const priorStudent = previous?.studentMetrics.find((item) => item.studentId === student.studentId);
    const hadPriorAttention = priorStudent?.evolutionStatus === "DECLINED";
    const educatorPairs = scopedClassIds.map((classId) => classById.get(classId)).filter(Boolean);
    const row: EvolutionStudent = {
      studentId: student.studentId,
      studentName: student.studentName,
      classIds: scopedClassIds,
      classNames: scopedClassIds.map((classId) => classById.get(classId)?.className ?? classId),
      educatorIds: [...new Set(educatorPairs.map((item) => item?.educatorId).filter((value): value is string => Boolean(value)))],
      educatorNames: [...new Set(educatorPairs.map((item) => item?.educatorName).filter((value): value is string => Boolean(value)))],
      previousPercentage, currentPercentage, deltaPercentagePoints: delta, evolutionStatus,
      attentionStatus: attentionStatus(evolutionStatus, streak, hadPriorAttention), declineStreak: streak,
      categoryMetrics: categories,
      history: ordered.slice().reverse().map((report) => {
        const historical = report.studentMetrics.find((item) => item.studentId === student.studentId);
        const percentage = studentPercentage(historical, filters.categoryId);
        const prior = historical ? studentPreviousPercentage(historical, filters.categoryId) : null;
        return { weekStart: report.weekStart, percentage, deltaPercentagePoints: percentage === null || prior === null ? null : percentage - prior };
      }),
      categoryHistory: Object.fromEntries(current.categoryMetrics.map((category) => [category.categoryId, ordered.slice().reverse().map((report) => {
        const historical = report.studentMetrics.find((item) => item.studentId === student.studentId);
        const percentage = studentPercentage(historical, category.categoryId);
        const prior = historical ? studentPreviousPercentage(historical, category.categoryId) : null;
        return { weekStart: report.weekStart, percentage, deltaPercentagePoints: percentage === null || prior === null ? null : percentage - prior };
      })])),
    };
    if (filters.situation && filters.situation !== "ALL" && row.attentionStatus !== filters.situation) return [];
    return [row];
  });

  const educators = current.educatorMetrics.flatMap((educator) => {
    if (filters.educatorId && educator.educatorId !== filters.educatorId) return [];
    const members = students.filter((student) => student.educatorIds.includes(educator.educatorId));
    const scopedClasses = classes.filter((item) => item.educatorId === educator.educatorId && (!filters.classId || item.classId === filters.classId));
    return [groupMetric(educator.educatorId, educator.educatorName, scopedClasses.map((item) => item.classId), scopedClasses.map((item) => item.className), members, buildGroupHistory(ordered, educator.educatorId, filters.classId, filters.categoryId))];
  }).sort((a, b) => (b.deltaPercentagePoints ?? -Infinity) - (a.deltaPercentagePoints ?? -Infinity));

  const classMetrics = classes.filter((item) => allowedClassIds.has(item.classId)).map((item) => groupMetric(item.classId, item.className, [item.classId], [item.className], students.filter((student) => student.classIds.includes(item.classId)), buildGroupHistory(ordered, undefined, item.classId, filters.categoryId)));
  const categories = current.categoryMetrics.map((item) => ({ id: item.categoryId, name: item.categoryName }));
  const comparable = students.filter((student) => student.deltaPercentagePoints !== null);
  const positive = comparable.filter((student) => (student.deltaPercentagePoints ?? 0) > 0);
  const negative = comparable.filter((student) => (student.deltaPercentagePoints ?? 0) < 0);
  const maxDelta = positive.length ? Math.max(...positive.map((student) => student.deltaPercentagePoints!)) : null;
  const minPositive = positive.length ? Math.min(...positive.map((student) => student.deltaPercentagePoints!)) : null;
  const minDelta = negative.length ? Math.min(...negative.map((student) => student.deltaPercentagePoints!)) : null;

  return {
    reportId: current._id, weekStart: current.weekStart, weekEnd: current.weekEnd,
    methodology: `Cumprimento de metas limitado a 100%. Evolução = percentual atual menos percentual anterior. Estabilidade: variação entre -${PEDAGOGICAL_STABILITY_MARGIN_PP} e +${PEDAGOGICAL_STABILITY_MARGIN_PP} p.p.`,
    filters: {
      educators: current.educatorMetrics.map((item) => ({ id: item.educatorId, name: item.educatorName })),
      classes: classes.map((item) => ({ id: item.classId, name: item.className, educatorId: item.educatorId, educatorName: item.educatorName })),
      categories,
    },
    students, educators, classes: classMetrics,
    summary: {
      total: students.length, comparable: comparable.length,
      evolved: comparable.filter((item) => item.evolutionStatus === "EVOLVED").length,
      stable: comparable.filter((item) => item.evolutionStatus === "MAINTAINED").length,
      declined: comparable.filter((item) => item.evolutionStatus === "DECLINED").length,
      preventive: students.filter((item) => item.attentionStatus === "PREVENTIVE_ATTENTION").length,
      priority: students.filter((item) => item.attentionStatus === "PRIORITY_ATTENTION").length,
      followUp: students.filter((item) => item.attentionStatus === "INDIVIDUAL_FOLLOW_UP").length,
      recovering: students.filter((item) => item.attentionStatus === "RECOVERING").length,
      insufficient: students.filter((item) => item.attentionStatus === "INSUFFICIENT_DATA").length,
    },
    highlights: {
      greatestEvolution: maxDelta === null ? [] : students.filter((student) => student.deltaPercentagePoints === maxDelta),
      smallestEvolution: minPositive === null ? [] : students.filter((student) => student.deltaPercentagePoints === minPositive),
      greatestDecline: minDelta === null ? [] : students.filter((student) => student.deltaPercentagePoints === minDelta),
    },
  };
}

export type PedagogicalEvolution = NonNullable<ReturnType<typeof buildPedagogicalEvolution>>;
