import assert from "node:assert/strict";
import test from "node:test";

import { getActivityWeek } from "../src/lib/weekly-calendar.ts";
import {
  calculatePointsDifference,
  calculateProportionalPoints,
} from "../src/lib/weekly-scoring.ts";

const points = (approvedQuantity, targetQuantity = 10, maximumPoints = 100) =>
  calculateProportionalPoints({ approvedQuantity, targetQuantity, maximumPoints });

test("proportional points always round a positive fraction up", () => {
  assert.equal(points(0), 0);
  assert.equal(points(0.01), 1);
  assert.equal(points(1.01), 11);
  assert.equal(points(5), 50);
});

test("proportional points stop at the configured ceiling", () => {
  assert.equal(points(10), 100);
  assert.equal(points(11), 100);
  assert.equal(points(1_000), 100);
  assert.equal(points(5, 10, 0), 0);
});

test("successive approvals credit only the accumulated difference", () => {
  const firstTotal = points(2);
  const secondTotal = points(5);

  assert.deepEqual(calculatePointsDifference(0, firstTotal), {
    previouslyCreditedPoints: 0,
    newlyCalculatedPoints: 20,
    difference: 20,
  });
  assert.equal(calculatePointsDifference(firstTotal, secondTotal).difference, 30);
  assert.equal(calculatePointsDifference(secondTotal, secondTotal).difference, 0);
});

test("corrections preserve negative differences for future reversals", () => {
  const credited = points(8);
  const corrected = points(3);
  assert.equal(calculatePointsDifference(credited, corrected).difference, -50);
});

test("invalid scoring configurations fail explicitly", () => {
  assert.throws(() => points(1, 0), RangeError);
  assert.throws(() => points(-1), RangeError);
  assert.throws(() => points(Number.NaN), RangeError);
  assert.throws(() => points(1, 10, 10.5), RangeError);
  assert.throws(() => calculatePointsDifference(-1, 0), RangeError);
  assert.throws(() => calculatePointsDifference(1.5, 2), RangeError);
});

test("Sunday and the following Monday belong to different Sao Paulo weeks", () => {
  const sunday = getActivityWeek(new Date("2026-11-16T02:59:59.999Z"));
  const monday = getActivityWeek(new Date("2026-11-16T03:00:00.000Z"));

  assert.equal(sunday.weekStart, "2026-11-09");
  assert.equal(sunday.weekEnd, "2026-11-15");
  assert.equal(monday.weekStart, "2026-11-16");
  assert.equal(monday.weekEnd, "2026-11-22");
});

test("week boundaries and closing instant use America/Sao_Paulo", () => {
  const week = getActivityWeek(new Date("2026-11-18T15:00:00Z"));
  assert.equal(week.startsAt.toISOString(), "2026-11-16T03:00:00.000Z");
  assert.equal(week.endsAtExclusive.toISOString(), "2026-11-23T03:00:00.000Z");
  assert.equal(week.closesAt.toISOString(), "2026-11-23T09:00:00.000Z");
  assert.equal(week.timeZone, "America/Sao_Paulo");
});

test("approval time cannot move an activity into another week", () => {
  const activityWeek = getActivityWeek(new Date("2026-11-15T23:00:00-03:00"));
  const approvalWeek = getActivityWeek(new Date("2026-11-16T10:00:00-03:00"));
  assert.equal(activityWeek.weekStart, "2026-11-09");
  assert.equal(approvalWeek.weekStart, "2026-11-16");
});
