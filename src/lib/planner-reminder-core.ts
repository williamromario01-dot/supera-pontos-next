import { createHash } from "node:crypto";

export const PLANNER_REMINDER_MINUTES = [0, 10, 30, 60, 1440] as const;
export type PlannerReminderMinutes = (typeof PLANNER_REMINDER_MINUTES)[number];
export const PLANNER_TIME_ZONE = "America/Sao_Paulo";

export function parseReminderMinutes(value: unknown): PlannerReminderMinutes | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !PLANNER_REMINDER_MINUTES.includes(value as PlannerReminderMinutes)) return undefined;
  return value as PlannerReminderMinutes;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function zonedDateTimeToUtc(civilDate: string, time: string, timeZone = PLANNER_TIME_ZONE): Date {
  const [year, month, day] = civilDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(desired);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(candidate, timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate = new Date(candidate.getTime() + desired - actualAsUtc);
  }
  return candidate;
}

export function getCivilDateInTimeZone(date: Date, timeZone = PLANNER_TIME_ZONE): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function reminderScheduledAt(civilDate: string, startTime: string, reminderMinutes: PlannerReminderMinutes): Date {
  return new Date(zonedDateTimeToUtc(civilDate, startTime).getTime() - reminderMinutes * 60_000);
}

export function plannerDeliveryId(input: { eventId: string; occurrenceDate: string; userId: string; subscriptionId: string; reminderMinutes: number; scheduledAt: Date }): string {
  return createHash("sha256").update([input.eventId, input.occurrenceDate, input.userId, input.subscriptionId, input.reminderMinutes, input.scheduledAt.toISOString()].join("\0")).digest("hex");
}

export function isWeeklyOccurrence(startDate: string, occurrenceDate: string, recurrenceEnd?: string | null): boolean {
  if (occurrenceDate < startDate || (recurrenceEnd && occurrenceDate > recurrenceEnd)) return false;
  const asUtcNoon = (value: string) => { const [year, month, day] = value.split("-").map(Number); return Date.UTC(year, month - 1, day, 12); };
  const difference = asUtcNoon(occurrenceDate) - asUtcNoon(startDate);
  return difference % (7 * 24 * 60 * 60_000) === 0;
}
