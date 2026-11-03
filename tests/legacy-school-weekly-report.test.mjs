import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { loadRoute } from "./helpers/load-route.mjs";

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$and") return value.every(part => matches(doc, part));
    if (key === "$or") return value.some(part => matches(doc, part));
    const actual = doc[key];
    if (value instanceof ObjectId) return actual instanceof ObjectId && actual.equals(value);
    if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
      if (op === "$type") return expected === "objectId" && actual instanceof ObjectId;
      if (op === "$exists") return Object.hasOwn(doc, key) === expected;
      if (op === "$in") return expected.some(item => matches({ value: actual }, { value: item }));
      if (op === "$ne") return actual !== expected;
      if (op === "$lt") return actual < expected;
      if (op === "$lte") return actual <= expected;
      if (op === "$gte") return actual >= expected;
      if (op === "$gt") return actual > expected;
      throw Error(`Unexpected filter ${op}`);
    });
    return value === null ? actual == null : actual === value;
  });
}
function fixture() {
  const schoolId = new ObjectId("6ab7dd70428f96c0cae8f35c");
  const companyId = new ObjectId("6ace5ca054b8a80fa371c4f5");
  const studentId = new ObjectId(), categoryId = new ObjectId();
  const school = { _id: schoolId, name: "Fixture legacy school", active: true, createdAt: new Date("2026-09-26Z") };
  const data = {
    schools: [school], companies: [{ _id: companyId, tradeName: "Fixture company" }],
    users: [{ _id: studentId, role: "student", schoolId, name: "Fixture student", points: 30, createdAt: new Date("2026-09-26Z") }],
    categories: [{ _id: categoryId, schoolId, name: "Fixture category", weeklyGoal: 10, participatesInRanking: true }],
    pointEvents: [{ _id: new ObjectId(), studentId, categoryId, points: 10, createdAt: new Date("2026-10-20T15:00Z") }, { _id: new ObjectId(), studentId, categoryId, points: 20, createdAt: new Date("2026-10-28T15:00Z") }],
    attendanceSessions: [], classes: [], pointStoreRedemptions: [], referrals: [], pointStoreProducts: [], productsSupera: [], weeklyReports: [],
  };
  const db = { collection(name) {
    assert.ok(name in data, `Unexpected collection ${name}`);
    return {
      find(filter) {
        let rows = data[name].filter(doc => matches(doc, filter));
        const cursor = { sort(order) { const [key, direction] = Object.entries(order)[0]; rows.sort((a,b) => String(a[key]).localeCompare(String(b[key])) * direction); return cursor; }, limit(n) { rows = rows.slice(0,n); return cursor; }, toArray: async () => rows, next: async () => rows[0] ?? null };
        return cursor;
      },
      findOne: async filter => data[name].find(doc => matches(doc, filter)) ?? null,
      insertOne: async document => { assert.equal(name, "weeklyReports"); data[name].push(document); return { insertedId: document._id }; },
    };
  } };
  return { school, companyId, schoolId, data, db, reports: loadRoute("src/lib/weekly-management-report.ts", {
    "@/lib/mongodb": { __esModule: true, default: Promise.resolve({ db: () => db }) },
  }) };
}

test("legacy school becomes eligible after company linkage without invented configuration fields", async () => {
  const f = fixture(); const now = new Date("2026-11-03T15:00Z");
  assert.deepEqual((await f.reports.closeLatestEligibleReports(f.db, now)).results, []);
  f.school.companyId = f.companyId;
  const protectedBefore = JSON.stringify({ users: f.data.users, events: f.data.pointEvents, school: f.school });
  const result = await f.reports.closeLatestEligibleReports(f.db, now);
  assert.equal(result.results.length, 1); assert.equal(result.results[0].created, true);
  const report = f.data.weeklyReports[0];
  assert.equal(report.weekStart, "2026-10-26"); assert.equal(report.weekEnd, "2026-11-01");
  assert.equal(report.generatedBy, "recovery"); assert.equal(report.status, "CLOSED");
  assert.equal(String(report.schoolId), String(f.schoolId)); assert.equal(String(report.companyId), String(f.companyId));
  assert.equal(report.summary.activeStudents, 1); assert.equal(report.summary.pointsAwarded, 20);
  assert.equal(JSON.stringify({ users: f.data.users, events: f.data.pointEvents, school: f.school }), protectedBefore);
  assert.equal(f.school.status, undefined); assert.equal(f.school.slug, undefined);
});
test("recovery is idempotent and subsequent weekly closure includes the migrated school", async () => {
  const f = fixture(); f.school.companyId = f.companyId;
  const firstDate = new Date("2026-11-03T15:00Z");
  await f.reports.closeLatestEligibleReports(f.db, firstDate);
  const first = JSON.stringify(f.data.weeklyReports[0]);
  const repeated = await f.reports.closeLatestEligibleReports(f.db, firstDate);
  assert.equal(repeated.results[0].created, false); assert.equal(f.data.weeklyReports.length, 1);
  const next = await f.reports.closeLatestEligibleReports(f.db, new Date("2026-11-09T16:00Z"));
  assert.equal(next.results[0].created, true); assert.equal(next.results[0].weekStart, "2026-11-02");
  assert.equal(f.data.weeklyReports.length, 2); assert.equal(JSON.stringify(f.data.weeklyReports[0]), first);
});

test("official closure snapshots attendance names/dates and never recalculates a closed report", async () => {
  const f = fixture(); f.school.companyId = f.companyId;
  f.data.attendanceSessions.push({ schoolId: f.schoolId, companyId: f.companyId, classId: "historical", className: "Turma histórica", date: "2026-10-28", session: "Aula 1", students: [{ studentId: "a", studentName: "Ana", present: true }, { studentId: "b", studentName: "Bia", present: false }] });
  const protectedBefore = JSON.stringify([f.data.users, f.data.pointEvents]);
  const now = new Date("2026-11-03T15:00Z");
  await f.reports.closeLatestEligibleReports(f.db, now);
  const report = f.data.weeklyReports[0];
  assert.equal(report.attendanceMetrics.percentage, 50);
  assert.equal(report.attendanceMetrics.absentees[0].studentName, "Bia");
  assert.equal(report.attendanceMetrics.absentees[0].date, "2026-10-28");
  const snapshot = JSON.stringify(report);
  f.data.attendanceSessions[0].students = [];
  await f.reports.closeLatestEligibleReports(f.db, now);
  assert.equal(f.data.weeklyReports.length, 1);
  assert.equal(JSON.stringify(f.data.weeklyReports[0]), snapshot);
  assert.equal(JSON.stringify([f.data.users, f.data.pointEvents]), protectedBefore);
});
