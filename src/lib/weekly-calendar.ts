import {
  WEEKLY_SCORING_TIME_ZONE,
  type ActivityWeek,
} from "./weekly-scoring-types.ts";

type CivilDate = { year: number; month: number; day: number };

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: WEEKLY_SCORING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(date: Date): CivilDate & { hour: number; minute: number; second: number } {
  if (Number.isNaN(date.getTime())) throw new RangeError("date must be valid");
  const values = Object.fromEntries(
    dateTimeFormatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return values as CivilDate & { hour: number; minute: number; second: number };
}

function addCivilDays(date: CivilDate, days: number): CivilDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function dayOfWeek(date: CivilDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12)).getUTCDay();
}

function toIsoDate(date: CivilDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** Converts a local Sao Paulo wall-clock time to its corresponding instant. */
function localDateTimeToInstant(date: CivilDate, hour: number): Date {
  const desiredAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, 0, 0);
  let candidate = new Date(desiredAsUtc);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(candidate);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const adjustment = desiredAsUtc - actualAsUtc;
    if (adjustment === 0) return candidate;
    candidate = new Date(candidate.getTime() + adjustment);
  }

  throw new RangeError("local date/time does not exist in America/Sao_Paulo");
}

/**
 * Resolves the activity week containing an instant. The activity timestamp—not
 * its approval timestamp—must be supplied. Weeks run Monday through Sunday and
 * close at 06:00 on the following Monday in Sao Paulo.
 */
export function getActivityWeek(activityAt: Date): ActivityWeek {
  const local = zonedParts(activityAt);
  const localDate: CivilDate = { year: local.year, month: local.month, day: local.day };
  const daysSinceMonday = (dayOfWeek(localDate) + 6) % 7;
  const monday = addCivilDays(localDate, -daysSinceMonday);
  const nextMonday = addCivilDays(monday, 7);
  const sunday = addCivilDays(monday, 6);

  return {
    weekStart: toIsoDate(monday),
    weekEnd: toIsoDate(sunday),
    startsAt: localDateTimeToInstant(monday, 0),
    endsAtExclusive: localDateTimeToInstant(nextMonday, 0),
    closesAt: localDateTimeToInstant(nextMonday, 6),
    timeZone: WEEKLY_SCORING_TIME_ZONE,
  };
}

