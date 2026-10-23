import { ObjectId, type Db, type Document } from "mongodb";
import type { AuthenticatedUser } from "@/lib/auth";
import { getSchoolObjectId } from "@/lib/auth";
import { resolvePlannerEventColorKey, type AgendaColorKey } from "@/lib/agenda-colors";

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_PLANNER_RANGE_DAYS = 42;

export function parseCivilDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function addCivilDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getSundayWeekStart(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

export function isRangeAllowed(start: string, end: string): boolean {
  if (end < start) return false;
  return addCivilDays(start, MAX_PLANNER_RANGE_DAYS) >= end;
}

export function expandPlannerEvent(event: Document, rangeStart: string, rangeEnd: string, institutionalColorKey?: AgendaColorKey) {
  const dates: string[] = [];
  const first = String(event.startDate);
  if (event.recurrence === "weekly") {
    let date = first;
    while (date < rangeStart) date = addCivilDays(date, 7);
    const recurrenceEnd = typeof event.recurrenceEnd === "string" ? event.recurrenceEnd : null;
    while (date <= rangeEnd && (!recurrenceEnd || date <= recurrenceEnd)) {
      dates.push(date);
      date = addCivilDays(date, 7);
    }
  } else if (first >= rangeStart && first <= rangeEnd) {
    dates.push(first);
  }
  return dates.map((date) => ({
    id: event._id.toString(), type: event.type, audience: event.audience ?? null,
    title: event.title, description: event.description ?? "", categoryId: event.categoryId?.toString() ?? null,
    categoryName: event.categoryName ?? null, classId: event.classId?.toString() ?? null,
    className: event.className ?? null, date, startTime: event.startTime, endTime: event.endTime ?? null,
    recurrence: event.recurrence, recurrenceEnd: event.recurrenceEnd ?? null,
    completed: event.completed === true, createdByName: event.createdByName ?? "",
    colorKey: institutionalColorKey ? resolvePlannerEventColorKey(event.type, event._id.toString(), event.colorKey, institutionalColorKey) : event.colorKey ?? null,
    editable: event.type === "personal",
  }));
}

export function resolveOperationalSchoolId(auth: AuthenticatedUser, supplied: unknown) {
  return auth.role === "super_admin" ? getSchoolObjectId(supplied) : auth.schoolId;
}

export async function getStudentClassIds(db: Db, studentId: ObjectId, schoolId: ObjectId) {
  const classes = await db.collection("classes").find({
    schoolId: { $in: [schoolId, schoolId.toString()] },
    studentIds: { $in: [studentId, studentId.toString()] },
  }, { projection: { _id: 1 } }).toArray();
  return classes.map((item) => item._id);
}
