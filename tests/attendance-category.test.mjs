import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, MongoServerError } from "mongodb";
import { loadRoute } from "./helpers/load-route.mjs";

function fixture() {
  const schoolId = new ObjectId(), actorId = new ObjectId();
  const categories = ["Qualquer nome", "Outra categoria"].map(name => ({ _id: new ObjectId(), schoolId, name, categoryType: "official" }));
  const auth = { role: "admin", schoolId, userId: actorId, user: { _id: actorId, schoolId, role: "admin" } };
  const indexes = [];
  const db = { collection(name) {
    if (name === "schools") return { findOne: async () => ({ _id: schoolId, active: true }) };
    if (name === "attendanceSessions" || name === "pointEvents") return { findOne: async () => null };
    assert.equal(name, "categories");
    return {
      createIndex: async (keys, options) => { indexes.push({ keys, options }); },
      findOne: async filter => categories.find(row => String(row._id) === String(filter._id)) ?? null,
      updateOne: async (filter, update) => {
        const row = categories.find(row => String(row._id) === String(filter._id));
        if (!row) return { matchedCount: 0 };
        const key = update.$set.attendanceSchoolKey;
        if (typeof key === "string" && categories.some(other => other !== row && other.attendanceSchoolKey === key)) throw new MongoServerError({ code: 11000, message: "duplicate" });
        Object.assign(row, update.$set); return { matchedCount: 1 };
      },
      deleteOne: async filter => { const i = categories.findIndex(row => String(row._id) === String(filter._id) && row.attendanceHistoryProtected !== true); if (i < 0) return { deletedCount: 0 }; categories.splice(i, 1); return { deletedCount: 1 }; },
    };
  } };
  const route = loadRoute("src/app/api/categories/[id]/route.ts", {
    "@/lib/mongodb": { __esModule: true, default: Promise.resolve({ db: () => db }) },
    "@/lib/auth": { authenticateRequest: async () => ({ authenticated: true, auth }), getSchoolObjectId: value => ObjectId.isValid(String(value)) ? new ObjectId(String(value)) : null, schoolExists: async () => true, hasRequiredRole: (actor, roles) => roles.includes(actor.role) },
    "@/lib/subscription-access": { getOperationalAccessForAuth: async () => ({ canPerformOperationalMutation: true }) },
  });
  const request = body => ({ nextUrl: new URL(`http://local?schoolId=${schoolId}`), json: async () => body });
  const context = category => ({ params: Promise.resolve({ id: String(category._id) }) });
  const mark = (category, isAttendance) => route.PATCH(request({ isAttendance }), context(category));
  return { route, mark, categories, auth, request, context, indexes, schoolId };
}

test("concurrent categories compete for one canonical school key, backed by unique partial index", async () => {
  const f = fixture();
  const responses = await Promise.all(f.categories.map(category => f.mark(category, true)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(f.categories.filter(category => category.isAttendance).length, 1);
  assert.equal(f.indexes[0].options.unique, true);
  assert.deepEqual(f.indexes[0].options.partialFilterExpression, { attendanceSchoolKey: { $type: "string" } });
});

test("unmark then switch preserves permanent history protection and leaves other schools independent", async () => {
  const f = fixture(); const [a, b] = f.categories;
  assert.equal((await f.mark(a, true)).status, 200);
  assert.equal((await f.mark(a, false)).status, 200);
  assert.equal(a.attendanceSchoolKey, null); assert.equal(a.attendanceHistoryProtected, true);
  assert.equal((await f.mark(b, true)).status, 200);
  assert.equal((await f.route.DELETE(f.request({}), f.context(a))).status, 409);
  const other = fixture(); assert.equal((await other.mark(other.categories[0], true)).status, 200);
});

test("legacy shared categories, foreign school and roles are rejected", async () => {
  for (const change of [category => { category.schoolId = new ObjectId(); }, category => { delete category.schoolId; }]) {
    const f = fixture(); change(f.categories[0]); assert.equal((await f.mark(f.categories[0], true)).status, 403);
  }
  for (const role of ["company_admin", "student", "educator"]) {
    const f = fixture(); f.auth.role = role; f.auth.user.role = role;
    assert.equal((await f.mark(f.categories[0], true)).status, 403);
  }
  const f = fixture(); f.categories[0].isAttendance = true;
  assert.equal((await f.route.PATCH(f.request({ active: false }), f.context(f.categories[0]))).status, 200);
  assert.equal(f.categories[0].isAttendance, false);
});
