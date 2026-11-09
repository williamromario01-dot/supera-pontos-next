export type AttendanceStudent = { studentId: string; studentName: string; present: boolean };
export type AttendanceSession = { classId: string; className: string; date: string; session: string; students: AttendanceStudent[] };
export type AttendanceClass = { classId: string; className: string; educatorId?: string | null; educatorName?: string | null };

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

export function validatePresentStudentIds(expected: string[], entries: unknown): entries is string[] {
  if (!Array.isArray(entries)) return false;
  const ids = new Set<string>();
  for (const value of entries) {
    if (typeof value !== "string" || !expected.includes(value) || ids.has(value)) return false;
    ids.add(value);
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

export function summarizeAttendanceByClasses(sessions: AttendanceSession[], classes: AttendanceClass[]) {
  const summary = summarizeAttendance(sessions);
  const sessionsByClass = new Map<string, AttendanceSession[]>();
  for (const attendance of sessions) {
    const key = String(attendance.classId);
    sessionsByClass.set(key, [...(sessionsByClass.get(key) || []), attendance]);
  }
  const classIds = new Set(classes.map((item) => String(item.classId)));
  const classAttendance = classes.map((classItem) => {
    const classSessions = sessionsByClass.get(String(classItem.classId)) || [];
    const classSummary = summarizeAttendance(classSessions);
    return {
      ...classItem,
      status: classSessions.length ? "RECORDED" as const : "NO_ATTENDANCE_RECORDED" as const,
      scheduleStatus: "INSUFFICIENT_SCHEDULE_DATA" as const,
      totalSessions: classSummary.totalSessions,
      opportunities: classSummary.opportunities,
      presences: classSummary.presences,
      absences: classSummary.absences,
      percentage: classSummary.percentage,
      absentees: classSummary.absentees,
      pendingDates: [] as string[],
    };
  });
  // Preserve a real historical call even if its class was archived after the call.
  for (const [classId, classSessions] of sessionsByClass) {
    if (classIds.has(classId)) continue;
    const classSummary = summarizeAttendance(classSessions);
    classAttendance.push({
      classId,
      className: classSessions[0]?.className || "Turma histórica",
      educatorId: null,
      educatorName: null,
      status: "RECORDED",
      scheduleStatus: "INSUFFICIENT_SCHEDULE_DATA",
      totalSessions: classSummary.totalSessions,
      opportunities: classSummary.opportunities,
      presences: classSummary.presences,
      absences: classSummary.absences,
      percentage: classSummary.percentage,
      absentees: classSummary.absentees,
      pendingDates: [],
    });
  }
  return { ...summary, available: classes.length > 0 || sessions.length > 0, classAttendance };
}

export function canAssignEducator(role: string) { return role === "admin" || role === "super_admin"; }

export function eligibleEducator(educator: Record<string, unknown>, schoolId: unknown, companyId: unknown) {
  return educator.role === "educator" && educator.active !== false && !!educator.schoolId && String(educator.schoolId) === String(schoolId) && (!educator.companyId || (!!companyId && String(educator.companyId) === String(companyId)));
}
