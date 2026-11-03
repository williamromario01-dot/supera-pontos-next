import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, MongoServerError } from "mongodb";
import { loadRoute } from "./helpers/load-route.mjs";
import { summarizeAttendance, validAttendanceDate, validateAttendanceStudents, eligibleEducator, canAssignEducator } from "../src/lib/attendance-core.ts";

const equal = (a, b) => String(a) === String(b);
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof ObjectId) && !(value instanceof Date)) {
      if ("$in" in value) return value.$in.some(item => equal(doc[key], item));
      if ("$ne" in value) return doc[key] !== value.$ne;
      if ("$gt" in value) return doc[key] > value.$gt;
    }
    return equal(doc[key], value);
  });
}
function fixture(role = "admin") {
  const schoolId = new ObjectId(), companyId = new ObjectId(), classId = new ObjectId(), educatorId = new ObjectId();
  const users = ["Ana", "Bia"].map(name => ({ _id: new ObjectId(), name, schoolId, companyId, active: true, role: "student", points: 100 }));
  users.push({ _id: educatorId, name: "Educador", schoolId, companyId, role: "educator", active: true });
  const auth = { role, schoolId, companyId, userId: educatorId, user: { _id: educatorId, role, schoolId, companyId } };
  const data = { schools: [{ _id: schoolId, companyId, active: true }], classes: [{ _id: classId, schoolId, name: "Turma A", studentIds: users.slice(0, 2).map(user => user._id), active: true }], users, attendanceSessions: [], categories: [], sessions: [{ token: "fixture", userId: educatorId, expiresAt: new Date(Date.now() + 600000) }], pointEvents: [{ points: 100 }] };
  let calls = [];
  const db = { collection(name) {
    assert.ok(name in data, `Unexpected collection ${name}`);
    const collection = {
      createIndex: async (keys, options) => { calls.push({ keys, options }); },
      findOne: async filter => data[name].find(row => matches(row, filter)) ?? null,
      find: filter => { const cursor = { project: () => cursor, sort: () => cursor, toArray: async () => data[name].filter(row => matches(row, filter)) }; return cursor; },
      insertOne: async doc => {
        assert.ok(["attendanceSessions", "categories"].includes(name));
        if (name === "attendanceSessions" && data[name].some(row => ["schoolId", "classId", "date", "session"].every(key => equal(row[key], doc[key])))) throw new MongoServerError({ code: 11000, message: "duplicate" });
        doc._id = new ObjectId(); data[name].push(doc); return { insertedId: doc._id };
      },
      updateOne: async (filter, update) => {
        assert.ok(["classes", "attendanceSessions", "schools"].includes(name));
        const doc = data[name].find(row => matches(row, filter)); if (!doc) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(doc, update.$set); if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) doc[key] += value;
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };
    return collection;
  } };
  const mocks = {
    "@/lib/mongodb": { __esModule: true, default: Promise.resolve({ db: () => db, startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) }) },
    "@/lib/auth": { authenticateRequest: async () => ({ authenticated: true, auth }), hasSchoolAccess: (actor, school) => actor.role === "super_admin" || equal(actor.schoolId, school) },
    "@/lib/subscription-access": { getOperationalAccessForAuth: async () => ({ canPerformOperationalMutation: true }) },
  };
  const route = loadRoute("src/app/api/classes/[id]/attendance/route.ts", mocks);
  const assignment = loadRoute("src/app/api/classes/[id]/route.ts", mocks);
  const request = (body = {}, query = "") => ({ cookies: { get: () => ({ value: "fixture" }) }, nextUrl: new URL(`http://local?schoolId=${schoolId}${query}`), json: async () => body });
  const context = { params: Promise.resolve({ id: String(classId) }) };
  const body = () => ({ date: "2026-10-28", session: "Aula 1", students: users.slice(0, 2).map((student, index) => ({ studentId: String(student._id), present: index === 0 })) });
  return { data, auth, route, assignment, request, context, body, schoolId, companyId, educatorId, calls };
}

test("attendance validates real dates, future dates and complete unique rosters", () => {
  assert.equal(validAttendanceDate("2026-02-30", "2026-11-03"), false);
  assert.equal(validAttendanceDate("2026-11-04", "2026-11-03"), false);
  assert.equal(validAttendanceDate("2026-10-28", "2026-11-03"), true);
  assert.equal(validateAttendanceStudents(["a", "b"], [{ studentId: "a", present: true }, { studentId: "a", present: false }]), false);
  assert.equal(validateAttendanceStudents(["a"], [{ studentId: "b", present: true }]), false);
});

test("only admin and super_admin assign active educators in the same school/company", () => {
  for (const role of ["student", "company_admin", "educator"]) assert.equal(canAssignEducator(role), false);
  assert.equal(canAssignEducator("admin"), true); assert.equal(canAssignEducator("super_admin"), true);
  const user = { role: "educator", schoolId: "s", companyId: "c" };
  assert.equal(eligibleEducator(user, "s", "c"), true);
  for (const changes of [{ role: "admin" }, { schoolId: "other" }, { companyId: "other" }, { active: false }]) assert.equal(eligibleEducator({ ...user, ...changes }, "s", "c"), false);
});

test("assignment adds, replaces and removes without changing legacy roster, balances or events", async () => {
  const f = fixture(); f.data.users[2].role = "admin";
  const educator = { ...f.data.users[2], _id: new ObjectId(), role: "educator" }; f.data.users.push(educator);
  const replacement = { ...educator, _id: new ObjectId(), name: "Outro educador" }; f.data.users.push(replacement);
  const before = JSON.stringify([f.data.classes[0].studentIds, f.data.users, f.data.pointEvents]);
  for (const educatorId of [String(educator._id), String(replacement._id), null]) {
    const response = await f.assignment.PATCH(f.request({ educatorId }), f.context);
    assert.equal(response.status, 200, JSON.stringify(await response.json()));
    assert.equal(String(f.data.classes[0].educatorId), String(educatorId));
  }
  assert.equal(JSON.stringify([f.data.classes[0].studentIds, f.data.users, f.data.pointEvents]), before);
});

test("assignment rejects operational roles, cross school/company and inactive educators", async () => {
  for (const role of ["educator", "student", "company_admin"]) {
    const f = fixture(role); f.data.users[2].role = role;
    assert.equal((await f.assignment.PATCH(f.request({ educatorId: null }), f.context)).status, 403);
  }
  for (const changes of [{ schoolId: new ObjectId() }, { companyId: new ObjectId() }, { active: false }, { role: "student" }]) {
    const f = fixture(); f.data.users[2].role = "admin";
    const educator = { ...f.data.users[2], _id: new ObjectId(), role: "educator", ...changes }; f.data.users.push(educator);
    assert.equal((await f.assignment.PATCH(f.request({ educatorId: String(educator._id) }), f.context)).status, 403);
    assert.equal(f.data.classes[0].educatorId, undefined);
  }
});

test("records explicit sessions; historical roster and names survive changes; audited corrections use CAS", async () => {
  const f = fixture(); const before = JSON.stringify([f.data.users, f.data.pointEvents]);
  assert.equal((await f.route.POST(f.request(f.body()), f.context)).status, 200);
  assert.equal((await f.route.POST(f.request(f.body()), f.context)).status, 409);
  f.data.classes[0].studentIds = [];
  const record = f.data.attendanceSessions[0]; assert.equal(record.students.length, 2);
  assert.deepEqual(record.students.map(s => s.present), [true, false]);
  const correction = { ...f.body(), version: 1, reason: "Conferência", students: record.students.map(s => ({ ...s, present: true })) };
  assert.equal((await f.route.PATCH(f.request(correction), f.context)).status, 200);
  assert.equal(record.audit.length, 2); assert.equal(record.audit[1].before[1].present, false);
  assert.equal((await f.route.PATCH(f.request(correction), f.context)).status, 409);
  assert.equal(JSON.stringify([f.data.users, f.data.pointEvents]), before);
});

test("concurrent duplicate inserts cannot create two calls, while another session is allowed", async () => {
  const f = fixture();
  const responses = await Promise.all([f.route.POST(f.request(f.body()), f.context), f.route.POST(f.request(f.body()), f.context)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await f.route.POST(f.request({ ...f.body(), session: "Aula 2" }), f.context)).status, 200);
  assert.equal(f.data.attendanceSessions.length, 2);
  assert.equal(f.calls[0].options.unique, true);
});

test("attendance denies unauthorized roles, unassigned educator and foreign roster", async () => {
  for (const role of ["company_admin", "student", "educator"]) {
    const f = fixture(role); assert.equal((await f.route.POST(f.request(f.body()), f.context)).status, 403);
  }
  const f = fixture(); const body = f.body(); body.students[0].studentId = String(new ObjectId());
  assert.equal((await f.route.POST(f.request(body), f.context)).status, 400);
  f.auth.schoolId = new ObjectId();
  assert.equal((await f.route.POST(f.request(f.body()), f.context)).status, 403);
});

test("assigned educators can call; super_admin must select the exact school", async () => {
  const educator = fixture("educator"); educator.data.classes[0].educatorId = educator.educatorId;
  assert.equal((await educator.route.POST(educator.request(educator.body()), educator.context)).status, 200);
  const f = fixture("super_admin"); f.data.users[2].role = "super_admin";
  const wrong = f.request(f.body()); wrong.nextUrl = new URL(`http://local?schoolId=${new ObjectId()}`);
  assert.equal((await f.route.POST(wrong, f.context)).status, 403);
  assert.equal((await f.assignment.PATCH({ ...wrong, json: async () => ({ educatorId: null }) }, f.context)).status, 403);
  assert.equal((await f.assignment.PATCH(f.request({ educatorId: null }), f.context)).status, 200);
});

test("frequency counts only recorded opportunities, with names, dates and separate sessions", () => {
  assert.equal(summarizeAttendance([]).percentage, null);
  assert.equal(summarizeAttendance([]).reason, "Sem registros de frequência no período");
  const session = { classId: "a", className: "Turma A", date: "2026-10-28", session: "Aula 1", students: [{ studentId: "1", studentName: "Ana", present: true }, { studentId: "2", studentName: "Bia", present: false }] };
  const summary = summarizeAttendance([session]);
  assert.equal(summary.totalSessions, 1); assert.equal(summary.presences, 1); assert.equal(summary.absences, 1); assert.equal(summary.percentage, 50);
  assert.equal(summary.absentees[0].studentName, "Bia"); assert.equal(summary.absentees[0].date, "2026-10-28");
});

test("new attendance sessions snapshot selected category while corrections keep original category", async () => {
  const f = fixture(); const first = { _id: new ObjectId(), schoolId: f.schoolId, name: "Primeira" }, second = { _id: new ObjectId(), schoolId: f.schoolId, name: "Segunda" };
  f.data.categories.push(first, second); f.data.schools[0].attendanceCategoryId = first._id;
  assert.equal((await f.route.POST(f.request(f.body()), f.context)).status, 200);
  f.data.schools[0].attendanceCategoryId = second._id;
  const next = { ...f.body(), session: "Aula 2" };
  assert.equal((await f.route.POST(f.request(next), f.context)).status, 200);
  assert.equal(String(f.data.attendanceSessions[0].categoryId), String(first._id)); assert.equal(f.data.attendanceSessions[0].categoryName, first.name);
  assert.equal(String(f.data.attendanceSessions[1].categoryId), String(second._id));
  assert.equal((await f.route.PATCH(f.request({ ...f.body(), version: 1, reason: "Correcao" }), f.context)).status, 200);
  assert.equal(String(f.data.attendanceSessions[0].categoryId), String(first._id)); assert.equal(f.data.users[0].points, 100);
});
