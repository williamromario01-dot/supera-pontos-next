export const WEEKLY_REPORT_TIME_ZONE = "America/Sao_Paulo";
export const WEEKLY_REPORT_VERSION = 1;
export const WEEKLY_REPORT_ANALYTICAL_CAP = 200;

export type EvolutionStatus = "EVOLVED" | "MAINTAINED" | "DECLINED" | "INSUFFICIENT_DATA";

export type WeeklyReportPeriod = {
  weekStart: string;
  weekEnd: string;
  startAt: Date;
  nextWeekStartAt: Date;
};

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: WEEKLY_REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function getCivilDateInTimeZone(date: Date): string {
  const parts = zonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function zonedDateTimeToUtc(civilDate: string, time: string): Date {
  const [year, month, day] = civilDate.split("-").map(Number); const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute); let candidate = new Date(desired);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(candidate);
    candidate = new Date(candidate.getTime() + desired - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second));
  }
  return candidate;
}

export function addCivilDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

export function mondayOnOrBefore(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return addCivilDays(value, -((weekday + 6) % 7));
}

export function periodForWeekStart(weekStart: string): WeeklyReportPeriod {
  const nextWeekStart = addCivilDays(weekStart, 7);
  return {
    weekStart,
    weekEnd: addCivilDays(weekStart, 6),
    startAt: zonedDateTimeToUtc(weekStart, "00:00"),
    nextWeekStartAt: zonedDateTimeToUtc(nextWeekStart, "00:00"),
  };
}

export function latestEligiblePeriod(now = new Date()): WeeklyReportPeriod {
  const today = getCivilDateInTimeZone(now);
  const currentMonday = mondayOnOrBefore(today);
  const cutoff = zonedDateTimeToUtc(currentMonday, "13:00");
  const weekStart = addCivilDays(currentMonday, now >= cutoff ? -7 : -14);
  return periodForWeekStart(weekStart);
}

export function generationMode(now = new Date()): "automatic" | "recovery" {
  const today = getCivilDateInTimeZone(now);
  const monday = mondayOnOrBefore(today);
  const cutoff = zonedDateTimeToUtc(monday, "13:00");
  return today === monday && now >= cutoff ? "automatic" : "recovery";
}

export function performancePercentage(realized: number, goal: number): number | null {
  if (!Number.isFinite(realized) || !Number.isFinite(goal) || goal <= 0) return null;
  return Math.min(WEEKLY_REPORT_ANALYTICAL_CAP, Math.max(0, (realized / goal) * 100));
}

export function classifyEvolution(current: number | null, previous: number | null) {
  if (current === null || previous === null) {
    return { evolutionStatus: "INSUFFICIENT_DATA" as const, evolutionDeltaPercentagePoints: null };
  }
  const delta = current - previous;
  const evolutionStatus: EvolutionStatus = delta >= 10 ? "EVOLVED" : delta <= -10 ? "DECLINED" : "MAINTAINED";
  return { evolutionStatus, evolutionDeltaPercentagePoints: delta };
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

export function percentage(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}

export function reportDocumentId(schoolId: string, weekStart: string): string {
  return `${schoolId}:${weekStart}`;
}
