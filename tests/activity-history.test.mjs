import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";

import { resolveActivityCreditedPoints } from "../src/lib/activity-history.ts";
import { activityPointsPresentation, activityStatusPresentation } from "../src/lib/activity-history-presentation.ts";

const activity = (status = "approved") => ({ _id: new ObjectId(), status });
const audit = (record, creditedPointsDelta, overrides = {}) => ({
  _id: new ObjectId(), activityRecordId: record._id, type: record.status,
  creditedPointsDelta, pointEventId: null, occurredAt: new Date("2026-11-23T12:00:00Z"), ...overrides,
});

test("activity history uses the official point event referenced by the latest audit", () => {
  const record = activity("approved");
  const pointEventId = new ObjectId();
  assert.equal(resolveActivityCreditedPoints(record, [audit(record, 999, { pointEventId })], [{ _id: pointEventId, activityRecordId: record._id, points: 13 }]), 13);
});

test("activity history preserves corrections, reversals, zero credits and non-credit statuses", () => {
  const corrected = activity("corrected");
  assert.equal(resolveActivityCreditedPoints(corrected, [audit(corrected, -8)], []), -8);
  const zero = activity("approved");
  assert.equal(resolveActivityCreditedPoints(zero, [audit(zero, 0)], []), 0);
  for (const status of ["pending", "rejected"]) assert.equal(resolveActivityCreditedPoints(activity(status), [], []), 0);
});

test("legacy history uses an official activity point event and otherwise stays unavailable", () => {
  const withEvent = activity("corrected");
  assert.equal(resolveActivityCreditedPoints(withEvent, [], [{ activityRecordId: String(withEvent._id), points: 5, createdAt: new Date() }]), 5);
  assert.equal(resolveActivityCreditedPoints(activity("approved"), [], []), null);
});

test("history presentation translates statuses and styles positive, negative, zero and unavailable points", () => {
  assert.deepEqual(["approved", "corrected", "rejected", "pending"].map((status) => activityStatusPresentation(status).label), ["Aprovado", "Corrigido", "Rejeitado", "Pendente"]);
  assert.match(activityStatusPresentation("approved").className, /emerald/);
  assert.match(activityStatusPresentation("corrected").className, /orange/);
  assert.match(activityStatusPresentation("rejected").className, /rose/);
  assert.equal(activityPointsPresentation(13).label, "+13 pontos");
  assert.match(activityPointsPresentation(13).className, /emerald/);
  assert.equal(activityPointsPresentation(-1).label, "-1 ponto");
  assert.match(activityPointsPresentation(-1).className, /rose/);
  assert.equal(activityPointsPresentation(0).label, "0 pontos");
  assert.equal(activityPointsPresentation(null).label, "Pontos não disponíveis");
});
