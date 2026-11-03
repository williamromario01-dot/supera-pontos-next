import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { loadRoute } from "./helpers/load-route.mjs";

const equal = (a, b) => String(a) === String(b);
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some(item => matches(doc, item));
    if (key === "$and") return value.every(item => matches(doc, item));
    const values = key.split(".").reduce((items, part) => items.flatMap(item => Array.isArray(item) ? item.map(row => row?.[part]) : [item?.[part]]), [doc]);
    if (value && typeof value === "object" && !(value instanceof ObjectId) && !(value instanceof Date)) {
      if ("$in" in value) return values.some(item => value.$in.some(v => equal(item, v)));
      if ("$ne" in value) return values.every(item => !equal(item, value.$ne));
      if ("$exists" in value) return values.some(item => item !== undefined) === value.$exists;
    }
    return values.some(item => equal(item, value));
  });
}
function fixture() {
  const schoolId = new ObjectId(), actorId = new ObjectId();
  const categories = ["DoaCao", "Outra categoria"].map(name => ({ _id: new ObjectId(), schoolId, name, categoryType: "official", active: true }));
  const auth = { role: "admin", schoolId, userId: actorId, user: { _id: actorId, schoolId, role: "admin" } };
  const data = { categories, schools: [{ _id: schoolId, active: true }], categoryOverrides: [], attendanceSessions: [], pointEvents: [], weeklyReports: [], redemptions: [], users: [{ _id: new ObjectId(), schoolId, role: "student", active: true, points: 0 }] };
  const indexes = [];
  const db = { listCollections: () => ({ toArray: async () => Object.keys(data).map(name => ({ name })) }), collection(name) {
    assert.ok(name in data, name);
    return {
      createIndex: async (keys, options) => { indexes.push({ keys, options }); },
      findOne: async filter => data[name].find(row => matches(row, filter)) ?? null,
      find: filter => { const cursor = { project: () => cursor, sort: () => cursor, toArray: async () => data[name].filter(row => matches(row, filter)) }; return cursor; },
      insertOne: async doc => { data[name].push(doc); return { insertedId: doc._id }; },
      updateOne: async (filter, update, options) => {
        let row = data[name].find(row => matches(row, filter));
        if (!row && options?.upsert) { row = { ...filter }; data[name].push(row); }
        if (!row) return { matchedCount: 0 };
        Object.assign(row, update.$set);
        for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + value;
        return { matchedCount: 1, modifiedCount: 1 };
      },
      deleteOne: async filter => { const i = data[name].findIndex(row => matches(row, filter)); if (i < 0) return { deletedCount: 0 }; data[name].splice(i, 1); return { deletedCount: 1 }; },
    };
  } };
  // Serialize commits as the database's common school write does. Failures roll back all collections.
  let queue = Promise.resolve();
  const client = { db: () => db, startSession: () => ({ endSession: async () => {}, withTransaction: fn => {
    const task = queue.then(async () => {
      const snapshot = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.map(row => ({ ...row }))]));
      try { return await fn(); } catch (error) { for (const name of Object.keys(data)) data[name].splice(0, data[name].length, ...snapshot[name]); throw error; }
    }); queue = task.catch(() => {}); return task;
  } }) };
  const mocks = {
    "@/lib/mongodb": { __esModule: true, default: Promise.resolve(client) },
    "@/lib/auth": { authenticateRequest: async () => ({ authenticated: true, auth }), getSchoolObjectId: value => ObjectId.isValid(String(value)) ? new ObjectId(String(value)) : null, schoolExists: async () => true, hasRequiredRole: (actor, roles) => roles.includes(actor.role) },
    "@/lib/subscription-access": { getOperationalAccessForAuth: async () => ({ canPerformOperationalMutation: true }) },
  };
  const route = loadRoute("src/app/api/categories/[id]/route.ts", mocks);
  const points = loadRoute("src/app/api/points/route.ts", mocks);
  const list = loadRoute("src/app/api/categories/route.ts", mocks);
  const request = body => ({ nextUrl: new URL(`http://local?schoolId=${auth.schoolId}`), json: async () => body });
  const context = category => ({ params: Promise.resolve({ id: String(category._id) }) });
  const mark = (category, isAttendance, expected = data.schools[0].attendanceCategoryId ? String(data.schools[0].attendanceCategoryId) : null) => route.PATCH(request({ isAttendance, expectedAttendanceCategoryId: expected }), context(category));
  const remove = category => route.DELETE(request({}), context(category));
  const archive = category => route.PATCH(request({ active: false, isAttendance: false, expectedAttendanceCategoryId: data.schools[0].attendanceCategoryId ? String(data.schools[0].attendanceCategoryId) : null }), context(category));
  return { route, list, points, mark, remove, archive, categories, auth, request, context, indexes, schoolId, data };
}

test("1. admin deletes own unused category and list immediately omits it", async () => {
  const f = fixture(), id = String(f.categories[0]._id); assert.equal((await f.remove(f.categories[0])).status, 200);
  const body = await (await f.list.GET(f.request({}))).json(); assert.ok(body.categories.every(c => c.id !== id));
});
test("2. DoaCao reports actual dependency failure without false success", async () => {
  const f = fixture(); f.data.pointEvents.push({ categoryId: String(f.categories[0]._id) });
  const response = await f.remove(f.categories[0]); assert.equal(response.status, 409); assert.match((await response.json()).error, /pointEvents/); assert.equal(f.categories.length, 2);
});
test("3. protects references in points, attendance, redemption and reports, in both id formats", async () => {
  for (const name of ["pointEvents", "attendanceSessions", "redemptions", "weeklyReports"]) for (const string of [false, true]) {
    const f = fixture(); f.data[name].push({ categoryId: string ? String(f.categories[0]._id) : f.categories[0]._id }); assert.equal((await f.remove(f.categories[0])).status, 409);
  }
});
test("4. archive removes operational category while preserving history and ID", async () => {
  const f = fixture(), category = f.categories[0]; f.data.pointEvents.push({ categoryId: category._id, points: 50 });
  const before = JSON.stringify(f.data.pointEvents); assert.equal((await f.archive(category)).status, 200); assert.equal(category.active, false); assert.equal(JSON.stringify(f.data.pointEvents), before);
  const body = await (await f.list.GET(f.request({}))).json(); assert.ok(!body.categories.some(c => c.id === String(category._id)));
});
test("5. admin cannot modify or delete another school category", async () => {
  const f = fixture(); f.categories[0].schoolId = new ObjectId(); assert.equal((await f.mark(f.categories[0], true)).status, 403); assert.equal((await f.remove(f.categories[0])).status, 403);
});
test("6. unidentified global category is never assigned to requesting school", async () => {
  const f = fixture(); delete f.categories[0].schoolId; assert.equal((await f.mark(f.categories[0], true)).status, 403); assert.equal((await f.remove(f.categories[0])).status, 403);
});
function migrated(f) {
  const schoolId = new ObjectId("6ab7dd70428f96c0cae8f35c"); f.auth.schoolId = schoolId; f.auth.user.schoolId = schoolId; f.data.schools[0]._id = schoolId;
  f.categories[0]._id = new ObjectId("6aaec880615f95e32eb71819"); delete f.categories[0].schoolId; return f.categories[0];
}
test("7. legacy customization is idempotent, unit-local and preserves original ID", async () => {
  const f = fixture(), category = migrated(f), before = JSON.stringify(category);
  for (const name of ["Local", "Local atualizado"]) assert.equal((await f.route.PATCH(f.request({ name }), f.context(category))).status, 200);
  assert.equal(JSON.stringify(category), before); assert.equal(f.data.categoryOverrides.length, 1); assert.equal(String(f.data.categoryOverrides[0].categoryId), String(category._id)); assert.equal((await f.remove(category)).status, 409);
});
test("8. old explicit types survive and unknown types stay unknown", async () => {
  const f = fixture(); delete f.categories[0].categoryType; f.categories[0].type = "extra"; f.categories[1].categoryType = "unknown";
  const body = await (await f.list.GET(f.request({}))).json(); assert.equal(body.categories[0].categoryType, "extra"); assert.equal(body.categories[1].categoryType, null);
});
test("9. existing category can become attendance category", async () => {
  const f = fixture(); assert.equal((await f.mark(f.categories[0], true)).status, 200); assert.equal(String(f.data.schools[0].attendanceCategoryId), String(f.categories[0]._id));
});
test("10. new category can be attendance category", async () => {
  const f = fixture(); const response = await f.list.POST(f.request({ name: "Nova", weeklyGoal: 10, defaultPoints: 50, isAttendance: true, expectedAttendanceCategoryId: null })); assert.equal(response.status, 201); assert.equal(String(f.data.schools[0].attendanceCategoryId), String((await response.json()).category.id));
});
test("11. confirmed switch is atomic and GET exposes exactly one current category", async () => {
  const f = fixture(); await f.mark(f.categories[0], true); assert.equal((await f.mark(f.categories[1], true)).status, 200);
  const body = await (await f.list.GET(f.request({}))).json(); assert.deepEqual(body.categories.filter(c => c.isAttendance).map(c => c.id), [String(f.categories[1]._id)]);
});
test("12. unmark current attendance category", async () => {
  const f = fixture(); await f.mark(f.categories[0], true); assert.equal((await f.mark(f.categories[0], false)).status, 200); assert.equal(f.data.schools[0].attendanceCategoryId, null);
});
test("13. replacement without explicit current confirmation is rejected", async () => {
  const f = fixture(); await f.mark(f.categories[0], true); assert.equal((await f.route.PATCH(f.request({ isAttendance: true }), f.context(f.categories[1]))).status, 409);
});
test("14. concurrent stale confirmations cannot both select categories", async () => {
  const f = fixture(); const results = await Promise.all(f.categories.map(category => f.mark(category, true, null))); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const body = await (await f.list.GET(f.request({}))).json(); assert.equal(body.categories.filter(c => c.isAttendance).length, 1);
});
test("15. switch preserves existing attendance session category, students and audit", async () => {
  const f = fixture(); await f.mark(f.categories[0], true); f.data.attendanceSessions.push({ categoryId: f.categories[0]._id, students: [{ present: true }], audit: ["original"] });
  const before = JSON.stringify(f.data.attendanceSessions); await f.mark(f.categories[1], true); assert.equal(JSON.stringify(f.data.attendanceSessions), before);
});
test("16. closed weekly reports remain byte-for-byte unchanged", async () => {
  const f = fixture(); f.data.weeklyReports.push({ closed: true, items: [{ categoryId: String(f.categories[0]._id), points: 100 }] }); const before = JSON.stringify(f.data.weeklyReports);
  assert.equal((await f.remove(f.categories[0])).status, 409); await f.archive(f.categories[0]); assert.equal(JSON.stringify(f.data.weeklyReports), before);
});
test("17. migrated unit can select legacy attendance through local config and archive locally", async () => {
  const f = fixture(), category = migrated(f), before = JSON.stringify(category); assert.equal((await f.mark(category, true)).status, 200);
  const body = await (await f.list.GET(f.request({}))).json(); assert.equal(body.categories.find(c => c.id === String(category._id)).isAttendance, true);
  assert.equal((await f.archive(category)).status, 200); assert.equal(f.data.schools[0].attendanceCategoryId, null); assert.equal(JSON.stringify(category), before);
});
test("18. category operations never mutate points, balances or historical collections", async () => {
  const f = fixture(); f.data.pointEvents.push({ categoryId: f.categories[0]._id, points: 99 }); f.data.users = [{ points: 99 }];
  const before = JSON.stringify([f.data.users, f.data.pointEvents, f.data.attendanceSessions, f.data.weeklyReports]); await f.mark(f.categories[0], true); await f.mark(f.categories[1], true); await f.archive(f.categories[0]);
  assert.equal(JSON.stringify([f.data.users, f.data.pointEvents, f.data.attendanceSessions, f.data.weeklyReports]), before);
});
test("super admin remains limited to selected unit; unrelated roles stay forbidden", async () => {
  const f = fixture(); f.auth.role = f.auth.user.role = "super_admin"; f.categories[0].schoolId = new ObjectId(); assert.equal((await f.mark(f.categories[0], true)).status, 403);
  for (const role of ["student", "company_admin", "educator"]) { const g = fixture(); g.auth.role = g.auth.user.role = role; assert.equal((await g.mark(g.categories[0], true)).status, 403); }
});

test("concurrent point launch and delete never create dangling historical references", async () => {
  for (const reverse of [false, true]) {
    const f = fixture(), category = f.categories[0], student = f.data.users[0];
    const launch = () => f.points.POST(f.request({ studentId: String(student._id), categoryId: String(category._id), points: 50 }));
    const operations = [() => f.remove(category), launch]; if (reverse) operations.reverse();
    const results = await Promise.all(operations.map(operation => operation()));
    assert.ok(results.every(response => [200, 201, 404, 409].includes(response.status)));
    assert.ok(f.data.pointEvents.every(event => f.categories.some(row => equal(row._id, event.categoryId))));
    assert.equal(f.data.users[0].points, f.data.pointEvents.reduce((sum, event) => sum + event.points, 0));
  }
});
test("optimistic category versions reject stale concurrent edits", async () => {
  const f = fixture(), category = f.categories[0];
  const results = await Promise.all(["Primeiro", "Segundo"].map(name => f.route.PATCH(f.request({ name, expectedVersion: 0 }), f.context(category))));
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]); assert.equal(f.categories[0].managementVersion, 1);
});
test("selection can be removed then unused category deleted; archive cannot reactivate attendance", async () => {
  const f = fixture(), category = f.categories[0]; await f.mark(category, true); assert.equal((await f.remove(category)).status, 409); await f.mark(category, false); assert.equal((await f.remove(category)).status, 200);
  const other = f.categories[0]; await f.archive(other); assert.equal((await f.mark(other, true)).status, 409);
});
test("legacy id never overrides explicit foreign-school ownership", async () => {
  const f = fixture(), category = migrated(f); category.schoolId = new ObjectId();
  const body = await (await f.list.GET(f.request({}))).json(); assert.ok(!body.categories.some(row => row.id === String(category._id))); assert.equal((await f.mark(category, true)).status, 403);
});
test("name-only legacy client update preserves preexisting attendance selection", async () => {
  const f = fixture(), category = f.categories[0]; category.isAttendance = true; category.attendanceSchoolKey = String(f.schoolId);
  assert.equal((await f.route.PATCH(f.request({ name: "Renomeada" }), f.context(category))).status, 200); assert.equal(String(f.data.schools[0].attendanceCategoryId), String(category._id));
});
