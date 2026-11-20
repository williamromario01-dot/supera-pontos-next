export const LEARNING_RHYTHM_TIMEZONE = "America/Sao_Paulo";

export type LearningRhythmStatus =
  | "insufficient_data"
  | "regular"
  | "preventive"
  | "priority"
  | "desired_exceeded"
  | "administrative_limit_exceeded";

export type StudyPause = { startDate: string; endDate: string; reason?: string };
export type ProgressSample = { date: string; questions: number };

export type LearningRhythmInput = {
  startDate: string;
  totalQuestions: number;
  completedQuestions: number;
  studyDaysPerWeek: number[];
  pauses?: StudyPause[];
  progress?: ProgressSample[];
  asOf?: string;
};

export type LearningRhythmMetrics = {
  status: LearningRhythmStatus;
  progressPercentage: number;
  referenceProgressPercentage: number;
  remainingQuestions: number;
  elapsedActiveDays: number;
  elapsedStudyDays: number;
  averageQuestionsPerStudyDay: number | null;
  recentQuestionsPerStudyDay: number | null;
  suggestedQuestionsPerStudyDay: number;
  projectedCompletionDate: string | null;
  desiredCompletionDate: string;
  administrativeLimitDate: string;
  dataSufficient: boolean;
};

const DAY = 86_400_000;
const parseDay = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Data civil inválida; use AAAA-MM-DD.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (formatDay(date) !== value) throw new Error("Data civil inválida.");
  return date;
};
const formatDay = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const expectedDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(expectedDay, lastDay));
  return result;
}
const isPaused = (day: string, pauses: StudyPause[]) => pauses.some((pause) => day >= pause.startDate && day <= pause.endDate);
const isStudyDay = (date: Date, weekdays: number[]) => weekdays.includes(date.getUTCDay());

export function calculateLearningRhythm(input: LearningRhythmInput): LearningRhythmMetrics {
  if (!Number.isSafeInteger(input.totalQuestions) || input.totalQuestions <= 0) throw new Error("Total de questões inválido.");
  if (!Number.isFinite(input.completedQuestions) || input.completedQuestions < 0) throw new Error("Questões concluídas inválidas.");
  const weekdays = [...new Set(input.studyDaysPerWeek)].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (weekdays.length === 0) throw new Error("Informe ao menos um dia planejado de estudo.");
  const start = parseDay(input.startDate);
  const asOf = parseDay(input.asOf ?? formatDay(new Date()));
  const pauses = input.pauses ?? [];
  const desired = addDays(addMonths(start, 4), 15); // Convenção: 4 meses civis + 15 dias.
  const administrative = addMonths(start, 6);
  let elapsedActiveDays = 0;
  let elapsedStudyDays = 0;
  for (let cursor = start; cursor <= asOf; cursor = addDays(cursor, 1)) {
    if (isPaused(formatDay(cursor), pauses)) continue;
    elapsedActiveDays += 1;
    if (isStudyDay(cursor, weekdays)) elapsedStudyDays += 1;
  }
  const completed = Math.min(input.totalQuestions, input.completedQuestions);
  const remainingQuestions = Math.max(0, input.totalQuestions - completed);
  const progressPercentage = (completed / input.totalQuestions) * 100;
  const referenceDuration = Math.max(1, Math.round((desired.getTime() - start.getTime()) / DAY));
  const referenceProgressPercentage = Math.min(100, (elapsedActiveDays / referenceDuration) * 100);
  const average = elapsedStudyDays > 0 ? completed / elapsedStudyDays : null;
  const recentStart = addDays(asOf, -27);
  const recent = (input.progress ?? []).filter((sample) => parseDay(sample.date) >= recentStart && parseDay(sample.date) <= asOf);
  const recentQuestions = recent.reduce((sum, sample) => sum + Math.max(0, sample.questions), 0);
  const recentStudyDays = new Set(recent.map((sample) => sample.date)).size;
  const recentAverage = recentStudyDays ? recentQuestions / recentStudyDays : null;
  const effectivePace = recentAverage && recentAverage > 0 ? recentAverage : average;
  let projectedCompletionDate: string | null = remainingQuestions === 0 ? formatDay(asOf) : null;
  if (remainingQuestions > 0 && effectivePace && effectivePace > 0) {
    let remainingStudyDays = Math.ceil(remainingQuestions / effectivePace);
    let cursor = addDays(asOf, 1);
    while (remainingStudyDays > 0 && cursor <= addMonths(asOf, 36)) {
      if (!isPaused(formatDay(cursor), pauses) && isStudyDay(cursor, weekdays)) remainingStudyDays -= 1;
      if (remainingStudyDays > 0) cursor = addDays(cursor, 1);
    }
    projectedCompletionDate = formatDay(cursor);
  }
  let plannedRemaining = 0;
  for (let cursor = addDays(asOf, 1); cursor <= desired; cursor = addDays(cursor, 1)) {
    if (!isPaused(formatDay(cursor), pauses) && isStudyDay(cursor, weekdays)) plannedRemaining += 1;
  }
  const suggestedQuestionsPerStudyDay = remainingQuestions ? Math.max(1, Math.ceil(remainingQuestions / Math.max(1, plannedRemaining))) : 0;
  const dataSufficient = elapsedActiveDays >= 7 && (completed > 0 || (input.progress?.length ?? 0) > 0);
  const paceRatio = referenceProgressPercentage > 0 ? progressPercentage / referenceProgressPercentage : 1;
  let status: LearningRhythmStatus = "regular";
  if (!dataSufficient) status = "insufficient_data";
  else if (asOf > administrative && remainingQuestions > 0) status = "administrative_limit_exceeded";
  else if (asOf > desired && remainingQuestions > 0) status = "desired_exceeded";
  else if ((projectedCompletionDate && projectedCompletionDate > formatDay(administrative)) || paceRatio < 0.35) status = "priority";
  else if ((projectedCompletionDate && projectedCompletionDate > formatDay(desired)) || paceRatio < 0.75) status = "preventive";
  // Alerta precoce obrigatório: após 3 meses, progresso abaixo de 5% exige prioridade.
  if (dataSufficient && asOf >= addMonths(start, 3) && progressPercentage < 5 && asOf <= administrative) status = "priority";
  return {
    status, progressPercentage, referenceProgressPercentage, remainingQuestions, elapsedActiveDays,
    elapsedStudyDays, averageQuestionsPerStudyDay: average, recentQuestionsPerStudyDay: recentAverage,
    suggestedQuestionsPerStudyDay, projectedCompletionDate, desiredCompletionDate: formatDay(desired),
    administrativeLimitDate: formatDay(administrative), dataSufficient,
  };
}

export function studentLearningMessage(metrics: LearningRhythmMetrics): string {
  if (metrics.remainingQuestions === 0) return "Livro concluído — parabéns pela constância!";
  if (!metrics.dataSufficient) return "Continue registrando seus estudos para receber sugestões personalizadas.";
  return `Uma boa meta é responder ${metrics.suggestedQuestionsPerStudyDay} questão(ões) em cada dia de estudo.`;
}
