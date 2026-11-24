import type { AttendanceSession } from "./attendance-core";

export type FrequencyModality = "WEEKLY" | "SCHOOL_DAYS" | "CUSTOM";
export type FrequencyConfiguration = {
  year: number;
  modality: FrequencyModality;
  expectedAnnualLessons: number;
  maximumAbsencePercentage: number;
  updatedAt?: Date | string;
  updatedByName?: string;
};

export type FrequencyAlert = "NORMAL" | "PREVENTIVE" | "ATTENTION" | "PRIORITY";

export function frequencyLimits(expectedAnnualLessons: number, maximumAbsencePercentage: number) {
  const expected = Math.max(0, Math.floor(expectedAnnualLessons));
  const percentage = Math.min(100, Math.max(0, maximumAbsencePercentage));
  const maximumAbsences = Math.floor(expected * percentage / 100);
  return { maximumAbsences, minimumPresences: expected - maximumAbsences, minimumFrequencyPercentage: 100 - percentage };
}

export function frequencyAlert(absences: number, allowance: number): FrequencyAlert {
  if (allowance <= 0) return absences > 0 ? "PRIORITY" : "NORMAL";
  const utilization = absences / allowance * 100;
  if (absences > allowance) return "PRIORITY";
  if (absences === allowance) return "ATTENTION";
  return utilization >= 75 ? "PREVENTIVE" : "NORMAL";
}

export function validFrequencyConfiguration(value: unknown): value is FrequencyConfiguration {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Number.isInteger(item.year) && Number(item.year) >= 2000 && Number(item.year) <= 2200
    && ["WEEKLY", "SCHOOL_DAYS", "CUSTOM"].includes(String(item.modality))
    && Number.isInteger(item.expectedAnnualLessons) && Number(item.expectedAnnualLessons) > 0 && Number(item.expectedAnnualLessons) <= 1000
    && typeof item.maximumAbsencePercentage === "number" && Number.isFinite(item.maximumAbsencePercentage)
    && item.maximumAbsencePercentage >= 0 && item.maximumAbsencePercentage <= 100;
}

function dateValue(value: unknown) {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function chronological(sessions: AttendanceSession[]) {
  return [...sessions].sort((a, b) => `${a.date}\u0000${a.session}\u0000${a.classId}`.localeCompare(`${b.date}\u0000${b.session}\u0000${b.classId}`));
}

export function buildFrequencyMonitoring(input: {
  configuration: FrequencyConfiguration;
  sessions: AttendanceSession[];
  students: Array<{ id: string; name: string; enrollmentDate?: unknown }>;
  classes: Array<{ id: string; name: string; studentIds: string[]; classType?: string }>;
  today?: string;
}) {
  const { configuration } = input;
  const today = input.today || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const yearPrefix = `${configuration.year}-`;
  const uniqueSessions = new Map<string, AttendanceSession>();
  for (const item of input.sessions) if (item.date.startsWith(yearPrefix) && item.date <= today) uniqueSessions.set(`${item.classId}\u0000${item.date}\u0000${item.session}`, item);
  const sessions = chronological([...uniqueSessions.values()]);
  const periodKeys = new Set(sessions.map((item) => configuration.modality === "WEEKLY"
    ? weekKey(item.date)
    : configuration.modality === "SCHOOL_DAYS" ? item.date : `${item.date}\u0000${item.session}`));
  const completedPeriods = periodKeys.size;
  const baseLimits = frequencyLimits(configuration.expectedAnnualLessons, configuration.maximumAbsencePercentage);
  const students = input.students.map((student) => {
    const records = sessions.flatMap((session) => session.students.filter((entry) => entry.studentId === student.id).map((entry) => ({ ...entry, date: session.date, session: session.session, classId: session.classId, className: session.className })));
    const assessed = records.length;
    const presences = records.filter((item) => item.present).length;
    const absences = assessed - presences;
    const enrollmentDate = dateValue(student.enrollmentDate);
    const yearStart = `${configuration.year}-01-01`, yearEnd = `${configuration.year}-12-31`;
    const adjustedExpected = enrollmentDate && enrollmentDate > yearStart && enrollmentDate <= yearEnd
      ? Math.max(0, Math.ceil(configuration.expectedAnnualLessons * (new Date(`${yearEnd}T12:00:00Z`).getTime() - new Date(`${enrollmentDate}T12:00:00Z`).getTime() + 86_400_000) / (new Date(`${yearEnd}T12:00:00Z`).getTime() - new Date(`${yearStart}T12:00:00Z`).getTime() + 86_400_000)))
      : configuration.expectedAnnualLessons;
    const limits = frequencyLimits(adjustedExpected, configuration.maximumAbsencePercentage);
    let consecutiveAbsences = 0;
    for (let index = records.length - 1; index >= 0; index--) { if (records[index].present) break; consecutiveAbsences++; }
    return {
      studentId: student.id, studentName: student.name, assessed, presences, absences,
      expectedAnnualLessons: adjustedExpected, enrollmentAdjusted: adjustedExpected !== configuration.expectedAnnualLessons,
      annualAllowance: limits.maximumAbsences, allowanceUsed: absences,
      allowanceRemaining: Math.max(0, limits.maximumAbsences - absences), allowanceExceeded: Math.max(0, absences - limits.maximumAbsences),
      allowanceUtilizationPercentage: limits.maximumAbsences ? absences / limits.maximumAbsences * 100 : absences ? 100 : 0,
      currentFrequencyPercentage: assessed ? presences / assessed * 100 : null,
      consecutiveAbsences, annualAlert: frequencyAlert(absences, limits.maximumAbsences),
      history: records,
    };
  });
  const classMetrics = input.classes.filter((item) => item.classType !== "collaborators").map((item) => {
    const records = sessions.filter((session) => session.classId === item.id).flatMap((session) => session.students);
    const absences = records.filter((student) => !student.present).length;
    return { classId: item.id, className: item.name, assessed: records.length, presences: records.length - absences, absences, absencePercentage: records.length ? absences / records.length * 100 : null };
  });
  const assessed = students.reduce((sum, item) => sum + item.assessed, 0);
  const presences = students.reduce((sum, item) => sum + item.presences, 0);
  const ranked = classMetrics.filter((item) => item.absencePercentage != null);
  const bestValue = ranked.length ? Math.min(...ranked.map((item) => item.absencePercentage!)) : null;
  const worstValue = ranked.length ? Math.max(...ranked.map((item) => item.absencePercentage!)) : null;
  return {
    configuration: { ...configuration, ...baseLimits },
    calendar: { completedPeriods, remainingPeriods: Math.max(0, configuration.expectedAnnualLessons - completedPeriods), executionPercentage: configuration.expectedAnnualLessons ? Math.min(100, completedPeriods / configuration.expectedAnnualLessons * 100) : 0, source: "OFFICIAL_ATTENDANCE_SESSIONS" as const, sufficientForPlannedCalendar: false },
    overall: { assessed, presences, absences: assessed - presences, frequencyPercentage: assessed ? presences / assessed * 100 : null, studentsWithPreventiveAlert: students.filter((item) => item.annualAlert === "PREVENTIVE").length, studentsAtAttention: students.filter((item) => item.annualAlert === "ATTENTION").length, studentsAtPriority: students.filter((item) => item.annualAlert === "PRIORITY").length, studentsWithConsecutiveAlert: students.filter((item) => item.consecutiveAbsences > 0).length },
    students, classMetrics,
    bestClasses: bestValue == null ? [] : ranked.filter((item) => item.absencePercentage === bestValue),
    worstClasses: worstValue == null ? [] : ranked.filter((item) => item.absencePercentage === worstValue),
  };
}

function weekKey(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}
