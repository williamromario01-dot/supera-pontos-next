import { ObjectId, type Db, type Document } from "mongodb";
import { summarizeAttendanceByClasses, type AttendanceSession } from "./attendance-core.ts";
import type { WeeklyReport } from "./weekly-management-report-types.ts";

const id = (value: unknown) => value instanceof ObjectId ? value.toString() : String(value || "");
const schoolIdFilter = (schoolId: ObjectId) => ({ $in: [schoolId, schoolId.toString()] });
const absenteeKey = (item: { classId: string; studentId: string; date: string; session: string }) => [item.classId, item.studentId, item.date, item.session].join("\0");

export type AttendanceDetailsSource = "SNAPSHOT" | "RECOVERED_FROM_ATTENDANCE_SESSIONS" | "UNAVAILABLE";

export function complementAttendanceSnapshot(report: WeeklyReport, rawSessions: Document[]) {
  if (Array.isArray(report.attendanceMetrics.classAttendance)) {
    const unidentifiedAbsences = report.attendanceMetrics.absentees?.filter((item) => !item.educatorId).length ?? report.attendanceMetrics.unidentifiedAbsences ?? 0;
    return { ...report, attendanceMetrics: { ...report.attendanceMetrics, detailsSource: "SNAPSHOT" as const, unidentifiedAbsences } };
  }

  const educators = new Map(report.educatorMetrics.map((item) => [item.educatorId, item.educatorName]));
  const sessions: AttendanceSession[] = rawSessions.map((item) => {
    const explicitId = id(item.responsibleEducatorId);
    const creatorId = id(item.createdBy);
    const educatorId = explicitId && educators.has(explicitId) ? explicitId : educators.has(creatorId) ? creatorId : null;
    return {
      classId: id(item.classId), className: String(item.className || "Turma histórica"), date: String(item.date || ""), session: String(item.session || ""),
      students: Array.isArray(item.students) ? item.students.map((student) => ({ studentId: id(student.studentId), studentName: String(student.studentName || "Aluno"), present: student.present === true })) : [],
      responsibleEducatorId: educatorId,
      responsibleEducatorName: educatorId ? explicitId === educatorId && item.responsibleEducatorName ? String(item.responsibleEducatorName) : educators.get(educatorId) || null : null,
    };
  });
  const classes = report.classMetrics.map((item) => ({ classId: item.classId, className: item.className, educatorId: item.educatorId, educatorName: item.educatorName }));
  const recovered = summarizeAttendanceByClasses(sessions, classes);
  const storedKeys = [...(report.attendanceMetrics.absentees || [])].map(absenteeKey).sort();
  const recoveredKeys = recovered.absentees.map(absenteeKey).sort();
  const totalsMatch = recovered.totalSessions === report.attendanceMetrics.totalSessions && recovered.presences === report.attendanceMetrics.presences && recovered.absences === report.attendanceMetrics.absences;
  const identitiesMatch = storedKeys.length === recoveredKeys.length && storedKeys.every((value, index) => value === recoveredKeys[index]);
  if (!totalsMatch || !identitiesMatch) return { ...report, attendanceMetrics: { ...report.attendanceMetrics, detailsSource: "UNAVAILABLE" as const, detailsUnavailableReason: "Os registros originais não correspondem exatamente aos totais e ausências do snapshot fechado." } };

  const absencesByEducator = new Map<string, number>();
  for (const absence of recovered.absentees) if (absence.educatorId) absencesByEducator.set(absence.educatorId, (absencesByEducator.get(absence.educatorId) || 0) + 1);
  const unidentifiedAbsences = recovered.absentees.filter((item) => !item.educatorId).length;
  return {
    ...report,
    educatorMetrics: report.educatorMetrics.map((educator) => ({ ...educator, absences: absencesByEducator.get(educator.educatorId) || 0 })),
    attendanceMetrics: { ...report.attendanceMetrics, ...recovered, detailsSource: "RECOVERED_FROM_ATTENDANCE_SESSIONS" as const, unidentifiedAbsences },
  };
}

export async function loadAttendanceComplement(db: Db, schoolId: ObjectId, report: WeeklyReport) {
  if (Array.isArray(report.attendanceMetrics.classAttendance)) return complementAttendanceSnapshot(report, []);
  const sessions = await db.collection("attendanceSessions").find({ schoolId: schoolIdFilter(schoolId), date: { $gte: report.weekStart, $lte: report.weekEnd }, $or: [{ status: "FINALIZED" }, { status: { $exists: false } }] }).toArray();
  return complementAttendanceSnapshot(report, sessions);
}
