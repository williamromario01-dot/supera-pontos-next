export type AttendanceStudent = { studentId: string; studentName: string; present: boolean };
export type AttendanceSession = { classId: string; className: string; date: string; session: string; students: AttendanceStudent[] };

export function validAttendanceDate(value: unknown, today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= today;
}

export function validateAttendanceStudents(expected: string[], entries: unknown): entries is AttendanceStudent[] {
  if (!Array.isArray(entries) || entries.length !== expected.length) return false;
  const ids = new Set<string>();
  for (const item of entries) {
    if (!item || typeof item.studentId !== "string" || typeof item.present !== "boolean" || !expected.includes(item.studentId) || ids.has(item.studentId)) return false;
    ids.add(item.studentId);
  }
  return true;
}

export function summarizeAttendance(sessions: AttendanceSession[]) {
  const absentees = sessions.flatMap((session) => session.students.filter((student) => !student.present).map((student) => ({ ...student, classId: session.classId, className: session.className, date: session.date, session: session.session })));
  const opportunities = sessions.reduce((sum, session) => sum + session.students.length, 0);
  const absences = absentees.length;
  const presences = opportunities - absences;
  return { available: sessions.length > 0, reason: sessions.length ? undefined : "Sem registros de frequência no período", totalSessions: sessions.length, opportunities, presences, absences, percentage: opportunities ? presences / opportunities * 100 : null, absentees };
}

export function canAssignEducator(role: string) { return role === "admin" || role === "super_admin"; }

export function eligibleEducator(educator: Record<string, unknown>, schoolId: unknown, companyId: unknown) {
  return educator.role === "educator" && educator.active !== false && !!educator.schoolId && String(educator.schoolId) === String(schoolId) && (!educator.companyId || (!!companyId && String(educator.companyId) === String(companyId)));
}
