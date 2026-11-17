import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";

import {
  automaticActivityScoringEnabled,
  activityApprovalsEnabled,
  getEffectiveSchoolScoringMode,
  isSpecialPointBonus,
  resolveSpecialPointBonusIdempotencyKey,
  SpecialPointBonusValidationError,
  scoringModeConfigurationEnabled,
  requireSchoolScoringMode,
  scheduleSchoolScoringMode,
  ScoringModeAuthorizationError,
  ScoringModeConflictError,
} from "../src/lib/school-scoring-mode.ts";
import { getNextScoringModeEffectiveAt } from "../src/lib/weekly-calendar.ts";

const equal = (a, b) => String(a) === String(b);
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      if ("$ne" in expected) return !equal(actual, expected.$ne);
      if ("$lte" in expected) return actual <= expected.$lte;
      if ("$gt" in expected) return actual > expected.$gt;
    }
    return equal(actual, expected);
  });
}
function fixture() {
  const companyId = new ObjectId(), schoolId = new ObjectId(), actorId = new ObjectId();
  const state = { schools: [{ _id: schoolId, companyId, active: true }], schoolScoringModeChanges: [] };
  let queue = Promise.resolve();
  const db = { collection(name) { const rows = state[name]; assert.ok(rows); return {
    findOne: async (filter, options = {}) => {
      const found = rows.filter((row) => matches(row, filter));
      if (options.sort?.effectiveAt) found.sort((a, b) => options.sort.effectiveAt * (a.effectiveAt - b.effectiveAt));
      return found[0] ?? null;
    },
    insertOne: async (row) => { rows.push(row); return { insertedId: row._id }; },
  }; } };
  const client = { startSession: () => ({ withTransaction: (fn) => { const task = queue.then(fn); queue = task.catch(() => {}); return task; }, endSession: async () => {} }) };
  const input = (overrides = {}) => ({ companyId, schoolId, actorId, actorRole: "admin", futureMode: "automatic", idempotencyKey: "mode-request-001", now: new Date("2026-11-17T15:00:00Z"), ...overrides });
  return { state, db, client, input, companyId, schoolId, actorId };
}

test("all schools default to legacy and mode changes start next Monday at midnight Sao Paulo", async () => {
  const f = fixture();
  assert.equal(await getEffectiveSchoolScoringMode(f.db, f.schoolId, new Date("2026-11-17T15:00:00Z")), "legacy");
  const scheduled = await scheduleSchoolScoringMode(f.client, f.db, f.input());
  assert.equal(scheduled.change.previousMode, "legacy");
  assert.equal(scheduled.change.effectiveAt.toISOString(), "2026-11-23T03:00:00.000Z");
  assert.equal(await getEffectiveSchoolScoringMode(f.db, f.schoolId, new Date("2026-11-23T02:59:59Z")), "legacy");
  assert.equal(await getEffectiveSchoolScoringMode(f.db, f.schoolId, new Date("2026-11-23T03:00:00Z")), "automatic");
});

test("same scheduling request is idempotent and a conflicting schedule is rejected", async () => {
  const f = fixture();
  assert.equal((await scheduleSchoolScoringMode(f.client, f.db, f.input())).duplicate, false);
  assert.equal((await scheduleSchoolScoringMode(f.client, f.db, f.input())).duplicate, true);
  await assert.rejects(() => scheduleSchoolScoringMode(f.client, f.db, f.input({ idempotencyKey: "mode-request-002" })), ScoringModeConflictError);
  assert.equal(f.state.schoolScoringModeChanges.length, 1);
});

test("only school administrators and super administrators can schedule changes", async () => {
  const f = fixture();
  await assert.rejects(() => scheduleSchoolScoringMode(f.client, f.db, f.input({ actorRole: "educator" })), ScoringModeAuthorizationError);
  const other = fixture(); other.state.schools[0].companyId = new ObjectId();
  await assert.rejects(() => scheduleSchoolScoringMode(other.client, other.db, other.input()), ScoringModeAuthorizationError);
});

test("wrong engine is rejected for effective school mode", async () => {
  const f = fixture();
  await requireSchoolScoringMode(f.db, f.schoolId, "legacy", new Date("2026-11-17T15:00:00Z"));
  await assert.rejects(() => requireSchoolScoringMode(f.db, f.schoolId, "automatic", new Date("2026-11-17T15:00:00Z")), ScoringModeConflictError);
});

test("automatic credit and review flags fail closed while special bonus stays separate", () => {
  assert.equal(automaticActivityScoringEnabled({}), false);
  assert.equal(activityApprovalsEnabled({}), false);
  assert.equal(scoringModeConfigurationEnabled({}), false);
  assert.equal(automaticActivityScoringEnabled({ AUTOMATIC_ACTIVITY_SCORING_ENABLED: "true" }), true);
  assert.equal(activityApprovalsEnabled({ ACTIVITY_APPROVALS_ENABLED: "true" }), true);
  assert.equal(scoringModeConfigurationEnabled({ SCORING_MODE_CONFIGURATION_ENABLED: "true" }), true);
  assert.equal(isSpecialPointBonus({ scoringKind: "special_bonus" }, 100), true);
  assert.equal(isSpecialPointBonus({ scoringKind: "special_bonus" }, 99), false);
  assert.equal(resolveSpecialPointBonusIdempotencyKey({ scoringKind: "special_bonus" }, 100, "book-finish-001"), "book-finish-001");
  assert.equal(resolveSpecialPointBonusIdempotencyKey({}, 10, null), null);
  assert.throws(() => resolveSpecialPointBonusIdempotencyKey({ scoringKind: "special_bonus" }, 99, "book-finish-001"), SpecialPointBonusValidationError);
  assert.throws(() => resolveSpecialPointBonusIdempotencyKey({ scoringKind: "special_bonus" }, 100, "short"), SpecialPointBonusValidationError);
});

test("calendar helper always returns the following Monday, never a retroactive instant", () => {
  const requested = new Date("2026-11-23T04:00:00Z"); // Monday 01:00 Sao Paulo
  const effective = getNextScoringModeEffectiveAt(requested);
  assert.equal(effective.toISOString(), "2026-11-30T03:00:00.000Z");
  assert.ok(effective > requested);
});
