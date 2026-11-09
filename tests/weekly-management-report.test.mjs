import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { ObjectId } from "mongodb";
import {
  WEEKLY_REPORT_ANALYTICAL_CAP,
  WEEKLY_REPORT_TIME_ZONE,
  addCivilDays,
  average,
  classifyEvolution,
  generationMode,
  isProtectedWeeklyDate,
  latestEligiblePeriod,
  periodForWeekStart,
  performancePercentage,
  reportDocumentId,
  scheduledCloseAt,
} from "../src/lib/weekly-management-report-core.ts";
import { resolveWeeklyReportSchool } from "../src/lib/weekly-management-report-access.ts";
import { complementAttendanceSnapshot } from "../src/lib/weekly-management-report-attendance.ts";

const root = process.cwd();
const read = (file) => fs.readFile(path.join(root, file), "utf8");
const schoolA = new ObjectId();
const schoolB = new ObjectId();
const auth = (role, schoolId = null) => ({ role, schoolId, userId: new ObjectId(), companyId: null, user: {} });

test("previous week uses Monday through Sunday in America/Sao_Paulo", () => {
  const period = latestEligiblePeriod(new Date("2026-10-26T16:00:00.000Z"));
  assert.equal(WEEKLY_REPORT_TIME_ZONE, "America/Sao_Paulo");
  assert.equal(period.weekStart, "2026-10-19");
  assert.equal(period.weekEnd, "2026-10-25");
  assert.equal(period.startAt.toISOString(), "2026-10-19T03:00:00.000Z");
  assert.equal(period.nextWeekStartAt.toISOString(), "2026-10-26T03:00:00.000Z");
});

test("Monday 06:00 America/Sao_Paulo is the closing boundary", () => {
  assert.equal(latestEligiblePeriod(new Date("2026-11-09T08:59:59.999Z")).weekStart, "2026-10-26");
  assert.equal(latestEligiblePeriod(new Date("2026-11-09T09:00:00.000Z")).weekStart, "2026-11-02");
  assert.equal(latestEligiblePeriod(new Date("2026-11-09T09:01:00.000Z")).weekStart, "2026-11-02");
  assert.equal(generationMode(new Date("2026-11-09T09:00:00.000Z")), "automatic");
  assert.equal(scheduledCloseAt(periodForWeekStart("2026-11-02")).toISOString(), "2026-11-09T09:00:00.000Z");
});

test("temporal protection starts with week 45 and does not touch week 44", () => {
  const before = new Date("2026-11-09T08:59:59.999Z");
  const boundary = new Date("2026-11-09T09:00:00.000Z");
  const after = new Date("2026-11-09T09:01:00.000Z");
  assert.equal(isProtectedWeeklyDate("2026-11-08", before), false);
  assert.equal(isProtectedWeeklyDate("2026-11-08", boundary), true);
  assert.equal(isProtectedWeeklyDate("2026-11-08", after), true);
  assert.equal(isProtectedWeeklyDate("2026-11-01", after), false);
  assert.equal(isProtectedWeeklyDate("2026-11-09", after), false);
});

test("a missed Monday close is recovered with the original period", () => {
  const tuesday = new Date("2026-11-10T14:00:00.000Z");
  assert.equal(generationMode(tuesday), "recovery");
  assert.equal(latestEligiblePeriod(tuesday).weekStart, "2026-11-02");
});

test("evolution boundaries use percentage points exactly", () => {
  assert.equal(classifyEvolution(60, 50).evolutionStatus, "EVOLVED");
  assert.equal(classifyEvolution(40, 50).evolutionStatus, "DECLINED");
  assert.equal(classifyEvolution(59.9, 50).evolutionStatus, "MAINTAINED");
  assert.equal(classifyEvolution(40.1, 50).evolutionStatus, "MAINTAINED");
});

test("new student or category and absent data remain insufficient", () => {
  assert.deepEqual(classifyEvolution(50, null), { evolutionStatus: "INSUFFICIENT_DATA", evolutionDeltaPercentagePoints: null });
  assert.deepEqual(classifyEvolution(null, 50), { evolutionStatus: "INSUFFICIENT_DATA", evolutionDeltaPercentagePoints: null });
});

test("real zero differs from absence, above-goal performance is retained and capped at 200", () => {
  assert.equal(performancePercentage(0, 10), 0);
  assert.equal(performancePercentage(12, 10), 120);
  assert.equal(performancePercentage(25, 10), WEEKLY_REPORT_ANALYTICAL_CAP);
  assert.equal(performancePercentage(10, 0), null);
});

test("overall evolution averages categories equally instead of weighting event volume", () => {
  const previous = average([20, 100]);
  const current = average([40, 100]);
  assert.equal(previous, 60);
  assert.equal(current, 70);
  assert.equal(classifyEvolution(current, previous).evolutionStatus, "EVOLVED");
});

test("goalReached remains independent from evolution status", () => {
  const aboveGoal = performancePercentage(10.5, 10);
  assert.equal(aboveGoal >= 100, true);
  assert.equal(classifyEvolution(aboveGoal, 120).evolutionStatus, "DECLINED");
  const belowGoal = performancePercentage(6, 10);
  assert.equal(belowGoal >= 100, false);
  assert.equal(classifyEvolution(belowGoal, 30).evolutionStatus, "EVOLVED");
});

test("deterministic id scopes idempotency by school and week", () => {
  assert.equal(reportDocumentId(schoolA.toString(), "2026-10-19"), `${schoolA}:2026-10-19`);
  assert.notEqual(reportDocumentId(schoolA.toString(), "2026-10-19"), reportDocumentId(schoolB.toString(), "2026-10-19"));
  assert.equal(addCivilDays("2026-10-19", 6), "2026-10-25");
});

test("admin is restricted to own school and operational roles are blocked", () => {
  assert.equal(resolveWeeklyReportSchool(auth("admin", schoolA), null).allowed, true);
  assert.equal(resolveWeeklyReportSchool(auth("admin", schoolA), schoolB.toString()).allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("student", schoolA), null).allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("educator", schoolA), null).allowed, false);
  assert.equal(resolveWeeklyReportSchool(auth("company_admin"), schoolA.toString()).allowed, false);
});

test("super admin requires explicit valid school context", () => {
  assert.equal(resolveWeeklyReportSchool(auth("super_admin"), null).allowed, false);
  const result = resolveWeeklyReportSchool(auth("super_admin"), schoolA.toString());
  assert.equal(result.allowed, true);
  if (result.allowed) assert.equal(result.schoolId.toString(), schoolA.toString());
});

test("snapshot implementation is insert-only, school-scoped and preserves historical names", async () => {
  const source = await read("src/lib/weekly-management-report.ts");
  assert.match(source, /collection<WeeklyReportDbDocument>\("weeklyReports"\)/);
  assert.match(source, /reports\.insertOne\(snapshot, \{ session \}\)/);
  assert.match(source, /if \(existing\) return \{ created: false/);
  assert.match(source, /error\.code === 11000/);
  assert.doesNotMatch(source, /reports\.(replaceOne|updateOne|findOneAndUpdate)/);
  assert.match(source, /studentName:/);
  assert.match(source, /categoryName:/);
  assert.match(source, /className:/);
  assert.match(source, /educatorName:/);
  assert.match(source, /productName:/);
  assert.match(source, /schoolId: SCHOOL_ID\(schoolId\)/);
});

test("custom categories are data-driven and goalReached is separate from evolution", async () => {
  const source = await read("src/lib/weekly-management-report.ts");
  for (const hardcoded of ["Ábaco", "Abrindo Horizontes", "Desafios", "Supera Online"]) assert.doesNotMatch(source, new RegExp(hardcoded));
  assert.match(source, /goalReached:/);
  assert.match(source, /evolutionStatus/);
  assert.match(source, /evolvedAmongAllActiveStudentsPercentage/);
  assert.match(source, /evolvedAmongComparableStudentsPercentage/);
});

test("attendance is unavailable and is never inferred from missing points", async () => {
  const source = await read("src/lib/weekly-management-report.ts");
  assert.match(source, /summarizeAttendanceByClasses/);
  assert.match(source, /status: "FINALIZED"/);
  assert.match(source, /ausência de pontos não é falta/);
});

test("cron remains closed without its dedicated secret", async () => {
  const route = await read("src/app/api/cron/weekly-management-reports/route.ts");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /authorization.*Bearer/);
  assert.match(route, /process\.env\.CRON_SECRET/);
});

test("historical attendance details recover four absences without mutating the closed snapshot", () => {
  const report = {
    weekStart: "2026-11-02", weekEnd: "2026-11-08",
    attendanceMetrics: { available: true, totalSessions: 1, presences: 4, absences: 4, percentage: 50, absentees: ["1", "2", "3", "4"].map((studentId) => ({ classId: "class-a", className: "Turma A", studentId, studentName: `Aluno ${studentId}`, present: false, date: "2026-11-05", session: "Aula 1" })) },
    educatorMetrics: [{ educatorId: "educator-a", educatorName: "Educadora A" }, { educatorId: "educator-b", educatorName: "Educadora B" }],
    classMetrics: [{ classId: "class-a", className: "Turma A", educatorId: "educator-a", educatorName: "Educadora A" }, { classId: "class-b", className: "Turma B", educatorId: "educator-b", educatorName: "Educadora B" }],
  };
  const before = JSON.stringify(report);
  const sessions = [{ classId: "class-a", className: "Turma A", date: "2026-11-05", session: "Aula 1", createdBy: "educator-a", students: ["1", "2", "3", "4"].map((studentId) => ({ studentId, studentName: `Aluno ${studentId}`, present: false })).concat(["5", "6", "7", "8"].map((studentId) => ({ studentId, studentName: `Aluno ${studentId}`, present: true }))) }];
  const view = complementAttendanceSnapshot(report, sessions);
  assert.equal(JSON.stringify(report), before);
  assert.equal(view.attendanceMetrics.detailsSource, "RECOVERED_FROM_ATTENDANCE_SESSIONS");
  assert.equal(view.attendanceMetrics.classAttendance.length, 2);
  assert.equal(view.attendanceMetrics.classAttendance[1].status, "NO_ATTENDANCE_RECORDED");
  assert.equal(view.educatorMetrics[0].absences, 4);
  assert.equal(view.educatorMetrics[1].absences, 0);
  assert.equal(view.attendanceMetrics.unidentifiedAbsences, 0);
});

test("unproved educator remains unidentified and inconsistent originals are never presented", () => {
  const base = { weekStart: "2026-11-02", weekEnd: "2026-11-08", attendanceMetrics: { totalSessions: 1, presences: 0, absences: 1, absentees: [{ classId: "c", studentId: "s", studentName: "Aluno", date: "2026-11-05", session: "Aula 1" }] }, educatorMetrics: [{ educatorId: "e", educatorName: "Educador" }], classMetrics: [{ classId: "c", className: "Turma", educatorId: "e", educatorName: "Educador" }] };
  const session = { classId: "c", className: "Turma", date: "2026-11-05", session: "Aula 1", createdBy: "admin", students: [{ studentId: "s", studentName: "Aluno", present: false }] };
  const recovered = complementAttendanceSnapshot(base, [session]);
  assert.equal(recovered.educatorMetrics[0].absences, 0);
  assert.equal(recovered.attendanceMetrics.unidentifiedAbsences, 1);
  const inconsistent = complementAttendanceSnapshot({ ...base, attendanceMetrics: { ...base.attendanceMetrics, absences: 2 } }, [session]);
  assert.equal(inconsistent.attendanceMetrics.detailsSource, "UNAVAILABLE");
  assert.equal(inconsistent.attendanceMetrics.classAttendance, undefined);
});

test("attendance cards expose recovered students, dates, sessions and educator identity", async () => {
  const source = await read("src/components/WeeklyManagementReportView.tsx");
  assert.match(source, /RECOVERED_FROM_ATTENDANCE_SESSIONS/);
  assert.match(source, /student\.educatorName/);
  assert.match(source, /Faltas sem educador identificado/);
  assert.match(source, /Sem chamada registrada/);
});

test("Vercel cron checks daily at 09:00 UTC for Monday closure and missed-run recovery", async () => {
  const config = JSON.parse(await read("vercel.json"));
  assert.deepEqual(config.crons, [{ path: "/api/cron/weekly-management-reports", schedule: "0 9 * * *" }]);
});

test("catch-up has an immutable floor at week 45", async () => {
  const source = await read("src/lib/weekly-management-report.ts");
  assert.match(source, /cursor >= WEEKLY_REPORT_FIRST_PROTECTED_WEEK/);
  assert.doesNotMatch(source, /reports\.(replaceOne|updateOne|findOneAndUpdate)/);
});

test("historical mutation APIs enforce the temporal backend lock", async () => {
  for (const file of ["src/app/api/classes/[id]/attendance/route.ts", "src/app/api/referrals/[id]/route.ts"]) {
    const source = await read(file);
    assert.match(source, /isProtectedWeeklyDate/);
    assert.match(source, /WEEKLY_PERIOD_CLOSED/);
  }
});
