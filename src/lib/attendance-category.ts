import type { Db, ObjectId } from "mongodb";

export async function ensureAttendanceCategoryIndex(db: Db) {
  await db.collection("categories").createIndex({ attendanceSchoolKey: 1 }, { name: "one_attendance_category_per_school", unique: true, partialFilterExpression: { attendanceSchoolKey: { $type: "string" } } });
}

export function attendanceCategoryFields(schoolId: ObjectId, isAttendance: boolean, active: boolean) {
  // null does not participate in the partial index; no legacy data is marked.
  return { isAttendance: isAttendance && active, attendanceSchoolKey: isAttendance && active ? schoolId.toString() : null, ...(isAttendance && active ? { attendanceHistoryProtected: true } : {}) };
}
