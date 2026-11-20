import assert from "node:assert/strict";
import test from "node:test";
import { calculateLearningRhythm, studentLearningMessage } from "../src/lib/learning-rhythm.ts";

const base = { startDate: "2026-01-10", totalQuestions: 200, studyDaysPerWeek: [1, 3, 5] };

test("uses the documented 4 calendar months plus 15 days and 6 calendar months", () => {
  const result = calculateLearningRhythm({ ...base, completedQuestions: 50, asOf: "2026-02-10" });
  assert.equal(result.desiredCompletionDate, "2026-05-25");
  assert.equal(result.administrativeLimitDate, "2026-07-10");
});

test("does not count justified pauses in active or planned study days", () => {
  const withoutPause = calculateLearningRhythm({ ...base, completedQuestions: 20, asOf: "2026-01-20" });
  const paused = calculateLearningRhythm({ ...base, completedQuestions: 20, asOf: "2026-01-20", pauses: [{ startDate: "2026-01-12", endDate: "2026-01-16" }] });
  assert.equal(withoutPause.elapsedActiveDays - paused.elapsedActiveDays, 5);
  assert.equal(withoutPause.elapsedStudyDays - paused.elapsedStudyDays, 3);
});

test("keeps scarce initial data in an explicit insufficient state", () => {
  const result = calculateLearningRhythm({ ...base, completedQuestions: 0, asOf: "2026-01-14" });
  assert.equal(result.status, "insufficient_data");
  assert.match(studentLearningMessage(result), /Continue registrando/);
});

test("raises the mandatory early priority signal after three months below five percent", () => {
  const result = calculateLearningRhythm({ ...base, completedQuestions: 8, asOf: "2026-04-10" });
  assert.equal(result.progressPercentage, 4);
  assert.equal(result.status, "priority");
});

test("reports desired and administrative overruns without changing progress", () => {
  assert.equal(calculateLearningRhythm({ ...base, completedQuestions: 100, asOf: "2026-06-01" }).status, "desired_exceeded");
  assert.equal(calculateLearningRhythm({ ...base, completedQuestions: 100, asOf: "2026-08-01" }).status, "administrative_limit_exceeded");
});

test("a recovered pace removes attention classifications", () => {
  const result = calculateLearningRhythm({ ...base, completedQuestions: 180, asOf: "2026-03-10", progress: [{ date: "2026-03-09", questions: 20 }] });
  assert.equal(result.status, "regular");
});

test("completed books receive a positive message and no suggested workload", () => {
  const result = calculateLearningRhythm({ ...base, completedQuestions: 250, asOf: "2026-02-10" });
  assert.equal(result.remainingQuestions, 0);
  assert.equal(result.suggestedQuestionsPerStudyDay, 0);
  assert.match(studentLearningMessage(result), /parabéns/);
});
