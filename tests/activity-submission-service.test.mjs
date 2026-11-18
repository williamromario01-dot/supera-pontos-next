import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
  ActivitySubmissionAuthorizationError,
  ActivitySubmissionClosedWeekError,
  ActivitySubmissionModeError,
  activitySubmissionsEnabled,
  submitActivity,
} from "../src/lib/activity-submission-service.ts";
import { ActivityPersistenceValidationError } from "../src/lib/activity-persistence.ts";

const equal = (a, b) => String(a) === String(b);

test("activity submission feature flag is disabled by default and enables only explicitly", () => {
  assert.equal(activitySubmissionsEnabled({}), false);
  assert.equal(activitySubmissionsEnabled({ ACTIVITY_SUBMISSIONS_ENABLED: "false" }), false);
  assert.equal(activitySubmissionsEnabled({ ACTIVITY_SUBMISSIONS_ENABLED: "TRUE" }), false);
  assert.equal(activitySubmissionsEnabled({ ACTIVITY_SUBMISSIONS_ENABLED: "true" }), true);
});
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      if ("$in" in expected) return Array.isArray(actual) ? actual.some((item) => expected.$in.some((value) => equal(item, value))) : expected.$in.some((value) => equal(actual, value));
      if ("$ne" in expected) return !equal(actual, expected.$ne);
      if ("$lte" in expected) return actual <= expected.$lte;
    }
    return equal(actual, expected);
  });
}
function clone(value) {
  if (value instanceof ObjectId) return new ObjectId(value.toHexString());
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
function fixture(options = {}) {
  const companyId = new ObjectId(), schoolId = options.schoolId ?? new ObjectId(), studentId = new ObjectId(), educatorId = new ObjectId(), categoryId = options.categoryId ?? new ObjectId();
  const state = {
    schools: [{ _id: schoolId, companyId, active: true }],
    users: [{ _id: studentId, companyId, schoolId, role: "student", active: true, points: 77 }],
    classes: [{ _id: new ObjectId(), schoolId, educatorId, studentIds: [studentId], active: true }],
    categories: [{ _id: categoryId, schoolId, active: true, weeklyGoal: 10, defaultPoints: 100 }],
    categoryOverrides: [], activityRecords: [], weeklyScoreLedgers: [], activityAuditEvents: [], pointEvents: [],
    schoolScoringModeChanges: [{ _id: new ObjectId(), companyId, schoolId, previousMode: "legacy", futureMode: "automatic", requestedBy: educatorId, requestedByRole: "admin", requestedAt: new Date("2026-11-15T12:00:00Z"), effectiveAt: new Date("2026-11-16T03:00:00Z"), idempotencyKey: "submission-mode-fixture" }],
  };
  let queue = Promise.resolve();
  const db = { collection(name) { const rows = state[name]; assert.ok(rows, name); return {
    findOne: async (filter) => rows.find((row) => matches(row, filter)) ?? null,
    find: (filter) => ({ toArray: async () => rows.filter((row) => matches(row, filter)) }),
    insertOne: async (document) => { if (rows.some((row) => row.schoolId && document.schoolId && equal(row.schoolId, document.schoolId) && row.submissionIdempotencyKey && row.submissionIdempotencyKey === document.submissionIdempotencyKey)) { const error = new Error("duplicate"); error.code = 11000; throw error; } rows.push(document); return { insertedId: document._id }; },
    updateOne: async (filter, update, options) => { let row = rows.find((item) => matches(item, filter)); if (!row && options?.upsert) { row = clone(update.$setOnInsert); rows.push(row); return { matchedCount: 0, upsertedCount: 1 }; } if (!row) return { matchedCount: 0 }; Object.assign(row, update.$set ?? {}); return { matchedCount: 1 }; },
  }; } };
  const client = { startSession: () => ({ withTransaction: (operation) => { const task = queue.then(async () => { const before = clone(state); try { return await operation(); } catch (error) { for (const key of Object.keys(state)) state[key].splice(0, state[key].length, ...before[key]); throw error; } }); queue = task.catch(() => {}); return task; }, endSession: async () => {} }) };
  const input = (overrides = {}) => ({ actorId: studentId, actorRole: "student", companyId, schoolId, studentId, categoryId, activityAt: new Date("2026-11-18T15:00:00Z"), reportedQuantity: 2, pageReached: 20, idempotencyKey: "submission-request-001", now: new Date("2026-11-18T16:00:00Z"), ...overrides });
  return { state, db, client, input, companyId, schoolId, studentId, educatorId, categoryId };
}

test("student submits only own pending activity and freezes the first configuration", async () => {
  const f = fixture();
  const result = await submitActivity(f.client, f.db, f.input());
  assert.equal(result.duplicate, false); assert.equal(result.activity.status, "pending");
  assert.equal(result.ledger.configurationSnapshot.targetQuantity, 10); assert.equal(result.ledger.configurationSnapshot.maximumPoints, 100);
  assert.equal(f.state.activityAuditEvents[0].type, "submitted");
  assert.equal(f.state.users[0].points, 77); assert.equal(f.state.pointEvents.length, 0);
});

test("traditional mode rejects activity submissions without creating records or points", async () => {
  const f = fixture();
  f.state.schoolScoringModeChanges.length = 0;
  await assert.rejects(() => submitActivity(f.client, f.db, f.input()), ActivitySubmissionModeError);
  assert.equal(f.state.activityRecords.length, 0);
  assert.equal(f.state.weeklyScoreLedgers.length, 0);
  assert.equal(f.state.pointEvents.length, 0);
  assert.equal(f.state.users[0].points, 77);
});

test("student cannot submit for another student", async () => {
  const f = fixture(), other = new ObjectId();
  f.state.users.push({ _id: other, companyId: f.companyId, schoolId: f.schoolId, role: "student", active: true, points: 0 });
  await assert.rejects(() => submitActivity(f.client, f.db, f.input({ studentId: other })), ActivitySubmissionAuthorizationError);
});

test("assigned educator can submit and unassigned educator cannot", async () => {
  const f = fixture();
  const accepted = await submitActivity(f.client, f.db, f.input({ actorId: f.educatorId, actorRole: "educator" }));
  assert.equal(accepted.activity.status, "pending"); assert.equal(f.state.activityAuditEvents[0].actorRole, "educator");
  const g = fixture();
  await assert.rejects(() => submitActivity(g.client, g.db, g.input({ actorId: new ObjectId(), actorRole: "educator" })), ActivitySubmissionAuthorizationError);
});

test("same request is idempotent and simultaneous duplicates create one activity", async () => {
  const f = fixture();
  const [first, second] = await Promise.all([submitActivity(f.client, f.db, f.input()), submitActivity(f.client, f.db, f.input())]);
  assert.deepEqual([first.duplicate, second.duplicate].sort(), [false, true]);
  assert.equal(f.state.activityRecords.length, 1); assert.equal(f.state.weeklyScoreLedgers.length, 1); assert.equal(f.state.activityAuditEvents.length, 1);
});

test("later submission preserves frozen goal after category configuration changes", async () => {
  const f = fixture(); await submitActivity(f.client, f.db, f.input());
  f.state.categories[0].weeklyGoal = 50; f.state.categories[0].defaultPoints = 500;
  const later = await submitActivity(f.client, f.db, f.input({ idempotencyKey: "submission-request-002", activityAt: new Date("2026-11-19T15:00:00Z") }));
  assert.equal(later.ledger.configurationSnapshot.targetQuantity, 10); assert.equal(later.ledger.configurationSnapshot.maximumPoints, 100);
  assert.equal(f.state.weeklyScoreLedgers.length, 1);
});

test("effective school override supplies weekly goal and maximum points", async () => {
  const f = fixture({ schoolId: new ObjectId("6ab7dd70428f96c0cae8f35c"), categoryId: new ObjectId("6aaec880615f95e32eb71819") });
  delete f.state.categories[0].schoolId;
  f.state.categoryOverrides.push({ schoolId: f.schoolId, categoryId: f.categoryId, weeklyGoal: 7, defaultPoints: 70, active: true });
  const result = await submitActivity(f.client, f.db, f.input());
  assert.equal(result.ledger.configurationSnapshot.targetQuantity, 7);
  assert.equal(result.ledger.configurationSnapshot.maximumPoints, 70);
});

test("quantity, page and closed-week validation fail before writes", async () => {
  const f = fixture();
  await assert.rejects(() => submitActivity(f.client, f.db, f.input({ reportedQuantity: 0 })), ActivityPersistenceValidationError);
  await assert.rejects(() => submitActivity(f.client, f.db, f.input({ pageReached: -1 })), ActivityPersistenceValidationError);
  await assert.rejects(() => submitActivity(f.client, f.db, f.input({ now: new Date("2026-11-23T09:00:00Z") })), ActivitySubmissionClosedWeekError);
  assert.equal(f.state.activityRecords.length, 0);
});

test("book is optional and prepared fields remain null", async () => {
  const f = fixture(); const result = await submitActivity(f.client, f.db, f.input({ book: null }));
  assert.equal(result.activity.book, null);
});
