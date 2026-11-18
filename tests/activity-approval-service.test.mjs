import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";

import {
  ActivityApprovalClosedWeekError,
  ActivityApprovalDisabledError,
  ActivityApprovalAuthorizationError,
  ActivityApprovalNotFoundError,
  processActivityApproval,
} from "../src/lib/activity-approval-service.ts";
import { ActivityPersistenceConflictError, buildActivityRecord } from "../src/lib/activity-persistence.ts";

const equal = (left, right) => String(left) === String(right);
function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      if ("$in" in expected) return expected.$in.some((value) => equal(actual, value));
      if ("$ne" in expected) return !equal(actual, expected.$ne);
      if ("$gte" in expected) return actual >= expected.$gte;
      if ("$lte" in expected) return actual <= expected.$lte;
    }
    return equal(actual, expected);
  });
}

function cloneValue(value) {
  if (value instanceof ObjectId) return new ObjectId(value.toHexString());
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

function fixture({ reportedQuantity = 3, balance = 0 } = {}) {
  const companyId = new ObjectId();
  const schoolId = new ObjectId();
  const studentId = new ObjectId();
  const categoryId = new ObjectId();
  const educatorId = new ObjectId();
  const activity = buildActivityRecord({
    companyId, schoolId, studentId, categoryId,
    activityAt: new Date("2026-11-18T15:00:00Z"),
    reportedQuantity,
    submissionIdempotencyKey: `submission-${new ObjectId()}`,
    now: new Date("2026-11-18T16:00:00Z"),
  });
  const state = {
    activityRecords: [activity],
    weeklyScoreLedgers: [],
    activityAuditEvents: [],
    activityAdjustmentPendencies: [],
    users: [{ _id: studentId, companyId, schoolId, role: "student", active: true, points: balance }],
    categories: [{ _id: categoryId, schoolId, active: true, weeklyGoal: 10, defaultPoints: 100 }],
    pointEvents: [],
    schoolScoringModeChanges: [{ _id: new ObjectId(), companyId, schoolId, previousMode: "legacy", futureMode: "automatic", requestedBy: educatorId, requestedByRole: "admin", requestedAt: new Date("2026-11-15T12:00:00Z"), effectiveAt: new Date("2026-11-16T03:00:00Z"), idempotencyKey: "mode-change-fixture" }],
  };
  let queue = Promise.resolve();
  let failAuditInsert = false;
  const db = { collection(name) {
    const rows = state[name];
    assert.ok(rows, name);
    return {
      findOne: async (filter) => rows.find((row) => matches(row, filter)) ?? null,
      insertOne: async (document) => {
        if (name === "activityAuditEvents" && failAuditInsert) throw new Error("injected audit failure");
        rows.push(document); return { insertedId: document._id };
      },
      updateOne: async (filter, update) => {
        const row = rows.find((item) => matches(item, filter));
        if (!row) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(row, update.$set ?? {});
        for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + value;
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };
  } };
  const client = { startSession: () => ({
    withTransaction: (operation) => {
      const task = queue.then(async () => {
        const before = cloneValue(state);
        try { return await operation(); }
        catch (error) {
          for (const key of Object.keys(state)) state[key].splice(0, state[key].length, ...before[key]);
          throw error;
        }
      });
      queue = task.catch(() => {});
      return task;
    },
    endSession: async () => {},
  }) };
  const input = (overrides = {}) => ({
    activityId: activity._id,
    schoolId,
    educatorId,
    actorRole: "educator",
    authorizedStudentIds: [studentId],
    decision: "approved",
    approvedQuantity: reportedQuantity,
    idempotencyKey: "approval-request-001",
    expectedActivityRevision: 0,
    now: new Date("2026-11-19T12:00:00Z"),
    automaticScoringEnabled: true,
    ...overrides,
  });
  return { state, client, db, input, activity, companyId, schoolId, studentId, categoryId, educatorId, setFailAudit: (value) => { failAuditInsert = value; } };
}

test("simple approval atomically credits the proportional difference", async () => {
  const f = fixture();
  const result = await processActivityApproval(f.client, f.db, f.input());
  assert.equal(result.pointsDifference, 30);
  assert.equal(result.resultingBalance, 30);
  assert.equal(f.state.users[0].points, 30);
  assert.equal(f.state.weeklyScoreLedgers[0].creditedPoints, 30);
  assert.equal(f.state.activityRecords[0].status, "approved");
  assert.equal(f.state.activityAuditEvents.length, 1);
});

test("automatic approval fails closed when activation is off or school is legacy", async () => {
  const disabled = fixture();
  await assert.rejects(() => processActivityApproval(disabled.client, disabled.db, disabled.input({ automaticScoringEnabled: false })), ActivityApprovalDisabledError);
  assert.equal(disabled.state.pointEvents.length, 0);
  const legacy = fixture();
  legacy.state.schoolScoringModeChanges.length = 0;
  await assert.rejects(() => processActivityApproval(legacy.client, legacy.db, legacy.input()), ActivityApprovalDisabledError);
  assert.equal(legacy.state.pointEvents.length, 0);
});

test("rejection is audited without credit and company administrators cannot decide", async () => {
  const rejected = fixture();
  const result = await processActivityApproval(rejected.client, rejected.db, rejected.input({ decision: "rejected", approvedQuantity: 0, justification: "Registro invÃ¡lido" }));
  assert.equal(result.pointsDifference, 0);
  assert.equal(result.approvedQuantity, 0);
  assert.equal(rejected.state.activityRecords[0].status, "rejected");
  assert.equal(rejected.state.activityAuditEvents[0].type, "rejected");
  assert.equal(rejected.state.pointEvents.length, 0);
  const forbidden = fixture();
  await assert.rejects(() => processActivityApproval(forbidden.client, forbidden.db, forbidden.input({ actorRole: "company_admin" })), ActivityApprovalAuthorizationError);
});

test("two simultaneous approvals with the same expected revision cannot both apply", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    processActivityApproval(f.client, f.db, f.input({ idempotencyKey: "concurrent-request-a" })),
    processActivityApproval(f.client, f.db, f.input({ idempotencyKey: "concurrent-request-b" })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected.reason instanceof ActivityPersistenceConflictError);
  assert.equal(f.state.pointEvents.length, 1);
  assert.equal(f.state.users[0].points, 30);
});

test("repeating the same request returns its prior result without another credit", async () => {
  const f = fixture();
  const first = await processActivityApproval(f.client, f.db, f.input());
  const repeated = await processActivityApproval(f.client, f.db, f.input());
  assert.equal(first.duplicate, false);
  assert.equal(repeated.duplicate, true);
  assert.equal(String(repeated.pointEventId), String(first.pointEventId));
  assert.equal(f.state.pointEvents.length, 1);
  assert.equal(f.state.users[0].points, 30);
});

test("an idempotency key cannot be reused for another activity", async () => {
  const f = fixture();
  await processActivityApproval(f.client, f.db, f.input());
  const second = buildActivityRecord({ companyId: f.companyId, schoolId: f.schoolId, studentId: f.studentId, categoryId: f.categoryId, activityAt: new Date("2026-11-20T12:00:00Z"), reportedQuantity: 1, submissionIdempotencyKey: "submission-collision", now: new Date("2026-11-20T13:00:00Z") });
  f.state.activityRecords.push(second);
  await assert.rejects(() => processActivityApproval(f.client, f.db, f.input({ activityId: second._id })), ActivityPersistenceConflictError);
  assert.equal(f.state.pointEvents.length, 1);
});

test("approved quantity above the target is capped at maximum points", async () => {
  const f = fixture({ reportedQuantity: 50 });
  const result = await processActivityApproval(f.client, f.db, f.input());
  assert.equal(result.pointsDifference, 100);
  assert.equal(f.state.users[0].points, 100);
});

test("correction to a lower quantity creates a compensating negative event", async () => {
  const f = fixture({ reportedQuantity: 8 });
  await processActivityApproval(f.client, f.db, f.input());
  const corrected = await processActivityApproval(f.client, f.db, f.input({ decision: "corrected", approvedQuantity: 3, justification: "Quantidade corrigida", idempotencyKey: "correction-request-01", expectedActivityRevision: 1 }));
  assert.equal(corrected.pointsDifference, -50);
  assert.equal(f.state.users[0].points, 30);
  assert.deepEqual(f.state.pointEvents.map((event) => event.points), [80, -50]);
  assert.equal(f.state.pointEvents[1].compensating, true);
});

test("reversal with insufficient balance aborts without partial writes", async () => {
  const f = fixture({ reportedQuantity: 8 });
  await processActivityApproval(f.client, f.db, f.input());
  f.state.users[0].points = 10;
  const before = JSON.stringify({ activity: f.state.activityRecords, ledger: f.state.weeklyScoreLedgers, points: f.state.pointEvents, user: f.state.users });
  const request = f.input({ decision: "corrected", approvedQuantity: 3, justification: "Quantidade corrigida", idempotencyKey: "correction-request-01", expectedActivityRevision: 1 });
  const pending = await processActivityApproval(f.client, f.db, request);
  assert.equal(pending.state, "pending_adjustment");
  assert.equal(pending.pointsDifference, 0);
  assert.equal(JSON.stringify({ activity: f.state.activityRecords, ledger: f.state.weeklyScoreLedgers, points: f.state.pointEvents, user: f.state.users }), before);
  assert.equal(f.state.activityAdjustmentPendencies.length, 1);
  assert.equal(f.state.activityAdjustmentPendencies[0].status, "open");
  assert.equal(f.state.activityAdjustmentPendencies[0].requiredPointsReversal, 50);
  const repeated = await processActivityApproval(f.client, f.db, request);
  assert.equal(repeated.state, "pending_adjustment");
  assert.equal(repeated.duplicate, true);
  assert.equal(f.state.activityAdjustmentPendencies.length, 1);
});

test("approval after Monday 06:00 Sao Paulo is rejected as closed", async () => {
  const f = fixture();
  await assert.rejects(() => processActivityApproval(f.client, f.db, f.input({ now: new Date("2026-11-23T09:00:00Z") })), ActivityApprovalClosedWeekError);
  assert.equal(f.state.pointEvents.length, 0);
});

test("category changes after first approval do not alter the frozen snapshot", async () => {
  const f = fixture({ reportedQuantity: 2 });
  await processActivityApproval(f.client, f.db, f.input());
  f.state.categories[0].weeklyGoal = 100;
  f.state.categories[0].defaultPoints = 1_000;
  const second = buildActivityRecord({ companyId: f.companyId, schoolId: f.schoolId, studentId: f.studentId, categoryId: f.categoryId, activityAt: new Date("2026-11-20T12:00:00Z"), reportedQuantity: 3, submissionIdempotencyKey: "submission-second-001", now: new Date("2026-11-20T13:00:00Z") });
  f.state.activityRecords.push(second);
  const result = await processActivityApproval(f.client, f.db, f.input({ activityId: second._id, approvedQuantity: 3, idempotencyKey: "approval-second-001" }));
  assert.equal(result.pointsDifference, 30);
  assert.equal(f.state.weeklyScoreLedgers[0].configurationSnapshot.targetQuantity, 10);
  assert.equal(f.state.weeklyScoreLedgers[0].configurationSnapshot.maximumPoints, 100);
});

test("an activity from another school cannot be approved", async () => {
  const f = fixture();
  await assert.rejects(() => processActivityApproval(f.client, f.db, f.input({ schoolId: new ObjectId() })), ActivityApprovalNotFoundError);
  assert.equal(f.state.pointEvents.length, 0);
});

test("a failure after balance mutation rolls back the whole transaction", async () => {
  const f = fixture();
  const before = JSON.stringify(f.state);
  f.setFailAudit(true);
  await assert.rejects(() => processActivityApproval(f.client, f.db, f.input()), /injected audit failure/);
  assert.equal(JSON.stringify(f.state), before);
});

test("point event preserves legacy consumer fields and adds traceability", async () => {
  const f = fixture();
  await processActivityApproval(f.client, f.db, f.input());
  const event = f.state.pointEvents[0];
  for (const field of ["studentId", "categoryId", "educatorId", "points", "createdAt"]) assert.ok(field in event);
  assert.equal(event.source, "weekly_activity");
  assert.equal(String(event.schoolId), String(f.schoolId));
  assert.equal(String(event.activityRecordId), String(f.activity._id));
  assert.equal(event.points, 30);
});
