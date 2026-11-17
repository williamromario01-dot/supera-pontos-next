import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";

import {
  ACTIVITY_PERSISTENCE_INDEXES,
  ActivityPersistenceConflictError,
  ActivityPersistenceScopeError,
  ActivityPersistenceValidationError,
  assertFrozenConfiguration,
  buildActivityDecisionPlan,
  buildActivityRecord,
  buildActivitySubmissionPersistencePlan,
  buildWeeklyLedgerInsert,
  buildWeeklyLedgerUpsert,
  ensureActivityPersistenceIndexes,
} from "../src/lib/activity-persistence.ts";
import { ACTIVITY_COLLECTIONS } from "../src/lib/activity-persistence-types.ts";

const ids = () => ({ companyId: new ObjectId(), schoolId: new ObjectId(), studentId: new ObjectId(), categoryId: new ObjectId() });
const now = new Date("2026-11-18T15:00:00.000Z");

function fixture() {
  const identity = ids();
  const activity = buildActivityRecord({
    ...identity,
    activityAt: new Date("2026-11-15T23:30:00-03:00"),
    reportedQuantity: 3,
    pageReached: 42,
    book: { bookId: "book-1", title: "Livro", isbn: null },
    submissionIdempotencyKey: "submission-001",
    now,
  });
  const snapshot = {
    schoolId: identity.schoolId.toHexString(),
    categoryId: identity.categoryId.toHexString(),
    targetQuantity: 10,
    maximumPoints: 100,
    frozenAt: now,
  };
  const ledger = buildWeeklyLedgerInsert({
    ...identity,
    weekStart: activity.weekStart,
    weekEnd: activity.weekEnd,
    configurationSnapshot: snapshot,
    now,
  });
  return { identity, activity, ledger, snapshot };
}

test("activity model derives its Sao Paulo week from activity time", () => {
  const { activity } = fixture();
  assert.equal(activity.weekStart, "2026-11-09");
  assert.equal(activity.weekEnd, "2026-11-15");
  assert.equal(activity.status, "pending");
  assert.equal(activity.approvedQuantity, null);
  assert.equal(activity.revision, 0);
});

test("activity and ledger validation reject malformed data", () => {
  const identity = ids();
  assert.throws(() => buildActivityRecord({ ...identity, activityAt: now, reportedQuantity: 0, submissionIdempotencyKey: "submission-001" }), ActivityPersistenceValidationError);
  assert.throws(() => buildActivityRecord({ ...identity, activityAt: now, reportedQuantity: 1, pageReached: -1, submissionIdempotencyKey: "submission-001" }), ActivityPersistenceValidationError);
  assert.throws(() => buildActivityRecord({ ...identity, activityAt: now, reportedQuantity: 1, submissionIdempotencyKey: "short" }), ActivityPersistenceValidationError);
  const snapshot = {
    schoolId: identity.schoolId.toHexString(),
    categoryId: identity.categoryId.toHexString(),
    targetQuantity: 10,
    maximumPoints: 100,
    frozenAt: now,
  };
  assert.throws(() => buildWeeklyLedgerInsert({ ...identity, weekStart: "bad", weekEnd: "2026-11-22", configurationSnapshot: snapshot }), ActivityPersistenceValidationError);
});

test("index declarations cover tenant queries, idempotency and unique ledger identity", () => {
  const ledgerIdentity = ACTIVITY_PERSISTENCE_INDEXES.find((index) => index.options.name === "weekly_ledger_identity");
  assert.deepEqual(ledgerIdentity?.keys, { schoolId: 1, studentId: 1, categoryId: 1, weekStart: 1 });
  assert.equal(ledgerIdentity?.options.unique, true);
  assert.equal(ACTIVITY_PERSISTENCE_INDEXES.find((index) => index.options.name === "activity_submission_idempotency")?.options.unique, true);
  assert.equal(ACTIVITY_PERSISTENCE_INDEXES.find((index) => index.options.name === "activity_audit_idempotency")?.options.unique, true);
  assert.ok(ACTIVITY_PERSISTENCE_INDEXES.every((index) => "schoolId" in index.keys));
});

test("index helper targets only the activity-system collections", async () => {
  const calls = [];
  const db = { collection: (collection) => ({ createIndex: async (keys, options) => calls.push({ collection, keys, options }) }) };
  await ensureActivityPersistenceIndexes(db);
  assert.equal(calls.length, ACTIVITY_PERSISTENCE_INDEXES.length);
  assert.deepEqual(new Set(calls.map((call) => call.collection)), new Set(Object.values(ACTIVITY_COLLECTIONS)));
});

test("weekly ledger upsert freezes configuration only on first insert", () => {
  const { ledger, snapshot } = fixture();
  const upsert = buildWeeklyLedgerUpsert(ledger);
  assert.deepEqual(upsert.filter, { schoolId: ledger.schoolId, studentId: ledger.studentId, categoryId: ledger.categoryId, weekStart: ledger.weekStart });
  assert.equal(upsert.update.$setOnInsert.configurationSnapshot.maximumPoints, 100);
  assert.deepEqual(upsert.options, { upsert: true });
  assert.doesNotThrow(() => assertFrozenConfiguration(ledger, snapshot));
  assert.throws(() => assertFrozenConfiguration(ledger, { ...snapshot, maximumPoints: 200 }), ActivityPersistenceConflictError);
});

test("submission contract freezes the snapshot while the activity is still pending", () => {
  const { activity, snapshot } = fixture();
  const plan = buildActivitySubmissionPersistencePlan({ activity, configurationSnapshot: snapshot, actorId: activity.studentId, now });
  assert.equal(plan.activity.status, "pending");
  assert.equal(plan.ledgerUpsert.update.$setOnInsert.configurationSnapshot.targetQuantity, 10);
  assert.equal(plan.auditEvent.type, "submitted");
  assert.equal(plan.auditEvent.after.status, "pending");
  assert.equal(plan.auditEvent.pointEventId, null);
});

test("approval updates only accumulated ledger projections and creates an audit event", () => {
  const { identity, activity, ledger } = fixture();
  const plan = buildActivityDecisionPlan({
    activity,
    ledger,
    schoolId: identity.schoolId,
    educatorId: new ObjectId(),
    actorRole: "educator",
    decision: "approved",
    approvedQuantity: 3,
    decisionIdempotencyKey: "approval-0001",
    expectedActivityRevision: 0,
    expectedLedgerRevision: 0,
    now,
  });
  assert.equal(plan.nextActivity.status, "approved");
  assert.equal(plan.nextLedger.approvedQuantity, 3);
  assert.equal(plan.nextLedger.calculatedPoints, 30);
  assert.equal(plan.nextLedger.creditedPoints, 0);
  assert.equal(plan.auditEvent.calculatedPointsDelta, 30);
  assert.deepEqual(plan.activityFilter, { _id: activity._id, schoolId: identity.schoolId, revision: 0 });
  assert.deepEqual(plan.ledgerFilter, { _id: ledger._id, schoolId: identity.schoolId, revision: 0 });
  assert.equal("_id" in plan.activityUpdate.$set, false);
  assert.equal("_id" in plan.ledgerUpdate.$set, false);
  assert.equal("creditedPoints" in plan.ledgerUpdate.$set, false);
});

test("correction can reduce quantity and retains a negative calculated delta", () => {
  const first = fixture();
  const approved = buildActivityDecisionPlan({ activity: first.activity, ledger: first.ledger, schoolId: first.identity.schoolId, educatorId: new ObjectId(), actorRole: "educator", decision: "approved", approvedQuantity: 8, decisionIdempotencyKey: "approval-0001", expectedActivityRevision: 0, expectedLedgerRevision: 0, now });
  const corrected = buildActivityDecisionPlan({ activity: approved.nextActivity, ledger: approved.nextLedger, schoolId: first.identity.schoolId, educatorId: new ObjectId(), actorRole: "admin", decision: "corrected", approvedQuantity: 3, decisionIdempotencyKey: "correction-001", expectedActivityRevision: 1, expectedLedgerRevision: 1, now });
  assert.equal(corrected.nextActivity.status, "corrected");
  assert.equal(corrected.nextLedger.approvedQuantity, 3);
  assert.equal(corrected.auditEvent.quantityDelta, -5);
  assert.equal(corrected.auditEvent.calculatedPointsDelta, -50);
  assert.equal(corrected.nextLedger.creditedPoints, 0);
});

test("school scope and stale revisions prevent cross-school or duplicate approval", () => {
  const { identity, activity, ledger } = fixture();
  const base = { activity, ledger, educatorId: new ObjectId(), actorRole: "educator", decision: "approved", approvedQuantity: 2, decisionIdempotencyKey: "approval-0001", expectedActivityRevision: 0, expectedLedgerRevision: 0, now };
  assert.throws(() => buildActivityDecisionPlan({ ...base, schoolId: new ObjectId() }), ActivityPersistenceScopeError);
  assert.throws(() => buildActivityDecisionPlan({ ...base, schoolId: identity.schoolId, expectedActivityRevision: 1 }), ActivityPersistenceConflictError);
  const applied = buildActivityDecisionPlan({ ...base, schoolId: identity.schoolId });
  assert.throws(() => buildActivityDecisionPlan({ ...base, schoolId: identity.schoolId, activity: applied.nextActivity, ledger: applied.nextLedger, expectedActivityRevision: 1, expectedLedgerRevision: 1 }), ActivityPersistenceConflictError);
});

test("activity and ledger from different tenants cannot be combined", () => {
  const left = fixture();
  const right = fixture();
  assert.throws(() => buildActivityDecisionPlan({ activity: left.activity, ledger: right.ledger, schoolId: left.identity.schoolId, educatorId: new ObjectId(), actorRole: "super_admin", decision: "approved", approvedQuantity: 1, decisionIdempotencyKey: "approval-0001", expectedActivityRevision: 0, expectedLedgerRevision: 0, now }), ActivityPersistenceScopeError);
});
