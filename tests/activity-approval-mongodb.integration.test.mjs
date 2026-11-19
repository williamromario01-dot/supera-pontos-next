import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { after, before, beforeEach, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  ActivityApprovalAuthorizationError,
  ActivityApprovalNotFoundError,
  processActivityApproval,
} from "../src/lib/activity-approval-service.ts";
import { decideActivityAdjustment } from "../src/lib/activity-adjustment-service.ts";
import {
  ACTIVITY_PERSISTENCE_INDEXES,
  ActivityPersistenceConflictError,
  ensureActivityPersistenceIndexes,
} from "../src/lib/activity-persistence.ts";
import {
  ActivitySubmissionAuthorizationError,
  ActivitySubmissionModeError,
  submitActivity,
} from "../src/lib/activity-submission-service.ts";
import {
  ensureScoringModeIndexes,
  getEffectiveSchoolScoringMode,
  scheduleSchoolScoringMode,
  SCORING_MODE_COLLECTION,
  SCORING_MODE_INDEXES,
} from "../src/lib/school-scoring-mode.ts";
import { periodForWeekStart } from "../src/lib/weekly-management-report-core.ts";
import { loadRoute } from "./helpers/load-route.mjs";

const { closeWeeklyReport } = loadRoute("src/lib/weekly-management-report.ts");

const DATABASE_NAME = "superpontos_activity_test";
const ACTIVITY_AT = new Date("2026-11-18T15:00:00Z");
const REVIEWED_AT = new Date("2026-11-19T12:00:00Z");

let replicaSet;
let client;
let db;

const temporaryClientPromiseMock = {
  __esModule: true,
  default: Promise.resolve({
    db: () => db,
    startSession: (...args) => client.startSession(...args),
  }),
};

function requestWithSession(url, token, body) {
  return {
    url,
    cookies: { get: (name) => name === "supera_session" ? { value: token } : undefined },
    json: async () => body,
  };
}

async function createIndexes() {
  await ensureActivityPersistenceIndexes(db);
  await ensureScoringModeIndexes(db);
}

async function seedSchool({ automatic = true } = {}) {
  const ids = {
    companyId: new ObjectId(),
    schoolId: new ObjectId(),
    otherSchoolId: new ObjectId(),
    studentId: new ObjectId(),
    educatorId: new ObjectId(),
    otherEducatorId: new ObjectId(),
    categoryId: new ObjectId(),
  };
  await Promise.all([
    db.collection("schools").insertMany([
      { _id: ids.schoolId, companyId: ids.companyId, name: "Escola principal", active: true },
      { _id: ids.otherSchoolId, companyId: ids.companyId, name: "Outra escola", active: true },
    ]),
    db.collection("companies").insertOne({ _id: ids.companyId, tradeName: "Empresa teste" }),
    db.collection("users").insertOne({
      _id: ids.studentId, companyId: ids.companyId, schoolId: ids.schoolId,
      role: "student", active: true, points: 0,
    }),
    db.collection("categories").insertOne({
      _id: ids.categoryId, schoolId: ids.schoolId, active: true,
      weeklyGoal: 10, defaultPoints: 100, participatesInRanking: true,
    }),
    db.collection("classes").insertOne({
      _id: new ObjectId(), schoolId: ids.schoolId, educatorId: ids.educatorId,
      studentIds: [ids.studentId], active: true,
    }),
  ]);
  if (automatic) {
    await db.collection(SCORING_MODE_COLLECTION).insertOne({
      _id: new ObjectId(), companyId: ids.companyId, schoolId: ids.schoolId,
      previousMode: "legacy", futureMode: "automatic", requestedBy: ids.educatorId,
      requestedByRole: "admin", requestedAt: new Date("2026-11-15T12:00:00Z"),
      effectiveAt: new Date("2026-11-16T03:00:00Z"), idempotencyKey: `mode-${ids.schoolId}`,
    });
  }
  return ids;
}

function submission(ids, overrides = {}) {
  return {
    actorId: ids.studentId, actorRole: "student", companyId: ids.companyId,
    schoolId: ids.schoolId, studentId: ids.studentId, categoryId: ids.categoryId,
    activityAt: ACTIVITY_AT, reportedQuantity: 10,
    idempotencyKey: "integration-submission-001", now: new Date("2026-11-18T16:00:00Z"),
    ...overrides,
  };
}

function approval(ids, activityId, overrides = {}) {
  return {
    activityId, schoolId: ids.schoolId, educatorId: ids.educatorId,
    actorRole: "educator", authorizedStudentIds: [ids.studentId],
    decision: "approved", approvedQuantity: 10, expectedActivityRevision: 0,
    idempotencyKey: "integration-approval-001", now: REVIEWED_AT,
    automaticScoringEnabled: true, ...overrides,
  };
}

before(async () => {
  if (process.env.MONGODB_ACTIVITY_TEST_URI) {
    assert.notEqual(process.env.MONGODB_ACTIVITY_TEST_URI, process.env.MONGODB_URI,
      "an externally supplied activity test URI must never equal MONGODB_URI");
  }
  replicaSet = await MongoMemoryReplSet.create({
    binary: { downloadDir: path.join(process.cwd(), "node_modules", ".cache", "mongodb-memory-server") },
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ dbName: DATABASE_NAME, launchTimeout: 60_000 }],
  });
  const uri = replicaSet.getUri(DATABASE_NAME);
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/, "temporary MongoDB must bind to loopback");
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  db = client.db(DATABASE_NAME);
  const hello = await db.admin().command({ hello: 1 });
  assert.ok(hello.setName, "temporary MongoDB must be a replica set with transaction support");
}, { timeout: 180_000 });

beforeEach(async () => {
  await db.dropDatabase();
  await createIndexes();
});

after(async () => {
  try {
    if (db) await db.dropDatabase();
    if (client) await client.close();
  } finally {
    if (replicaSet) await replicaSet.stop();
  }
}, { timeout: 60_000 });

test("temporary replica set creates every declared index and enforces unique identities", async () => {
  for (const expected of [...ACTIVITY_PERSISTENCE_INDEXES, ...SCORING_MODE_INDEXES.map((index) => ({
    collection: SCORING_MODE_COLLECTION, options: index.options,
  }))]) {
    const indexes = await db.collection(expected.collection).indexes();
    const actual = indexes.find((index) => index.name === expected.options.name);
    assert.ok(actual, `missing index ${expected.options.name}`);
    assert.equal(Boolean(actual.unique), Boolean(expected.options.unique));
  }

  const ids = await seedSchool();
  const first = await submitActivity(client, db, submission(ids));
  await assert.rejects(
    () => db.collection("activityRecords").insertOne({ ...first.activity, _id: new ObjectId() }),
    (error) => error?.code === 11000,
  );
  await assert.rejects(
    () => db.collection("weeklyScoreLedgers").insertOne({ ...first.ledger, _id: new ObjectId() }),
    (error) => error?.code === 11000,
  );
});

test("controlled staging command creates and verifies indexes only in an isolated database", async () => {
  const stagingDatabase = "superpontos_activity_homolog";
  const output = execFileSync(process.execPath, ["scripts/ensure-activity-indexes.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      ACTIVITY_INDEX_SETUP_ALLOWED: "true",
      MONGODB_ACTIVITY_STAGING_URI: replicaSet.getUri(),
      MONGODB_ACTIVITY_STAGING_DB: stagingDatabase,
      MONGODB_URI: "mongodb://production.invalid/never-used",
    },
  });
  assert.match(output, /Verified 13 automatic-scoring indexes/);
  const stagingDb = client.db(stagingDatabase);
  for (const expected of [...ACTIVITY_PERSISTENCE_INDEXES, ...SCORING_MODE_INDEXES.map((index) => ({
    collection: SCORING_MODE_COLLECTION, options: index.options,
  }))]) {
    const indexes = await stagingDb.collection(expected.collection).indexes();
    assert.ok(indexes.some((index) => index.name === expected.options.name));
  }
  await stagingDb.dropDatabase();
});

test("simultaneous submissions are idempotent and permissions isolate schools and profiles", async () => {
  const ids = await seedSchool();
  const results = await Promise.allSettled([
    submitActivity(client, db, submission(ids)),
    submitActivity(client, db, submission(ids)),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal((await db.collection("activityRecords").countDocuments()), 1);
  assert.equal((await db.collection("activityAuditEvents").countDocuments({ type: "submitted" })), 1);
  assert.equal(results.filter((result) => result.status === "fulfilled" && result.value.duplicate).length, 1);

  await assert.rejects(
    () => submitActivity(client, db, submission(ids, {
      actorId: ids.otherEducatorId, actorRole: "educator", idempotencyKey: "unauthorized-educator-submission",
    })),
    ActivitySubmissionAuthorizationError,
  );
  const activity = await db.collection("activityRecords").findOne();
  await assert.rejects(
    () => processActivityApproval(client, db, approval(ids, activity._id, { schoolId: ids.otherSchoolId })),
    ActivityApprovalNotFoundError,
  );
  await assert.rejects(
    () => processActivityApproval(client, db, approval(ids, activity._id, {
      actorRole: "company_admin", idempotencyKey: "company-admin-denied",
    })),
    ActivityApprovalAuthorizationError,
  );
  assert.equal((await db.collection("pointEvents").countDocuments()), 0);
  assert.equal((await db.collection("users").findOne({ _id: ids.studentId })).points, 0);
});

test("concurrent approval, idempotency, corrections and insufficient-balance pendency stay consistent", async () => {
  const ids = await seedSchool();
  const submitted = await submitActivity(client, db, submission(ids));
  const concurrent = await Promise.allSettled([
    processActivityApproval(client, db, approval(ids, submitted.activity._id, { idempotencyKey: "approval-concurrent-a" })),
    processActivityApproval(client, db, approval(ids, submitted.activity._id, { idempotencyKey: "approval-concurrent-b" })),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.ok(concurrent.some((result) => result.status === "rejected" && result.reason instanceof ActivityPersistenceConflictError));
  const winner = concurrent.find((result) => result.status === "fulfilled").value;
  const winnerEvent = await db.collection("pointEvents").findOne({ _id: winner.pointEventId });
  const duplicate = await processActivityApproval(client, db, approval(ids, submitted.activity._id, {
    idempotencyKey: winnerEvent.idempotencyKey,
  }));
  assert.equal(duplicate.duplicate, true);
  assert.equal((await db.collection("pointEvents").countDocuments()), 1);
  assert.equal((await db.collection("users").findOne({ _id: ids.studentId })).points, 100);

  const corrected = await processActivityApproval(client, db, approval(ids, submitted.activity._id, {
    decision: "corrected", approvedQuantity: 5, expectedActivityRevision: 1,
    idempotencyKey: "integration-correction-001", justification: "Quantidade revisada",
  }));
  assert.equal(corrected.pointsDifference, -50);
  assert.equal(corrected.resultingBalance, 50);
  const reversal = await db.collection("pointEvents").findOne({ idempotencyKey: "integration-correction-001" });
  assert.equal(reversal.points, -50);
  assert.equal(reversal.compensating, true);

  await db.collection("users").updateOne({ _id: ids.studentId }, { $set: { points: 10 } });
  const pending = await processActivityApproval(client, db, approval(ids, submitted.activity._id, {
    decision: "corrected", approvedQuantity: 1, expectedActivityRevision: 2,
    idempotencyKey: "insufficient-balance-correction", justification: "Nova correção validada",
  }));
  assert.equal(pending.state, "pending_adjustment");
  assert.equal(pending.pointsDifference, 0);
  assert.equal((await db.collection("users").findOne({ _id: ids.studentId })).points, 10);
  assert.equal((await db.collection("pointEvents").countDocuments()), 2);
  assert.equal((await db.collection("activityAdjustmentPendencies").countDocuments({ status: "open" })), 1);
  const unchanged = await db.collection("activityRecords").findOne({ _id: submitted.activity._id });
  assert.equal(unchanged.revision, 2);
  assert.equal(unchanged.approvedQuantity, 5);

  await db.collection("users").updateOne({ _id: ids.studentId }, { $set: { points: 50 } });
  const decisionInput = {
    pendencyId: pending.adjustmentPendencyId, schoolId: ids.schoolId, actorId: ids.educatorId,
    actorRole: "admin", action: "resolve", justification: "Saldo recomposto e estorno revisado",
    idempotencyKey: "resolve-pendency-integration", now: new Date("2026-11-19T14:00:00Z"),
  };
  const competingDecision = { ...decisionInput, idempotencyKey: "resolve-pendency-competing" };
  const resolutionRace = await Promise.allSettled([
    decideActivityAdjustment(client, db, decisionInput),
    decideActivityAdjustment(client, db, competingDecision),
  ]);
  assert.equal(resolutionRace.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(resolutionRace.filter((result) => result.status === "rejected").length, 1);
  const resolved = resolutionRace.find((result) => result.status === "fulfilled").value;
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.pointsDifference, -40);
  assert.equal(resolved.resultingBalance, 10);
  assert.equal((await db.collection("activityAdjustmentPendencies").findOne({ _id: pending.adjustmentPendencyId })).status, "resolved");
  assert.equal((await db.collection("activityRecords").findOne({ _id: submitted.activity._id })).approvedQuantity, 1);
  assert.equal((await db.collection("weeklyScoreLedgers").findOne({ _id: submitted.ledger._id })).creditedPoints, 10);
  assert.equal((await db.collection("pointEvents").countDocuments({ administrativeAdjustment: true, points: -40 })), 1);
  const winningKey = resolved.idempotencyKey ?? (
    await db.collection("activityAdjustmentPendencies").findOne({ _id: pending.adjustmentPendencyId })
  ).resolutionIdempotencyKey;
  assert.equal((await decideActivityAdjustment(client, db, { ...decisionInput, idempotencyKey: winningKey })).duplicate, true);
});

test("administrative cancellation is audited, idempotent and never changes balance or history", async () => {
  const ids = await seedSchool();
  const submitted = await submitActivity(client, db, submission(ids));
  await processActivityApproval(client, db, approval(ids, submitted.activity._id));
  await db.collection("users").updateOne({ _id: ids.studentId }, { $set: { points: 0 } });
  const pending = await processActivityApproval(client, db, approval(ids, submitted.activity._id, {
    decision: "corrected", approvedQuantity: 1, expectedActivityRevision: 1,
    idempotencyKey: "cancel-pendency-request", justification: "Correção administrativa solicitada",
  }));
  const beforeEvents = await db.collection("pointEvents").countDocuments();
  const cancelled = await decideActivityAdjustment(client, db, {
    pendencyId: pending.adjustmentPendencyId, schoolId: ids.schoolId, actorId: ids.educatorId,
    actorRole: "super_admin", action: "cancel", justification: "Solicitação considerada indevida",
    idempotencyKey: "cancel-pendency-decision", now: new Date("2026-11-19T14:00:00Z"),
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await db.collection("users").findOne({ _id: ids.studentId })).points, 0);
  assert.equal(await db.collection("pointEvents").countDocuments(), beforeEvents);
  assert.equal(await db.collection("activityAuditEvents").countDocuments({ type: "adjustment_cancelled" }), 1);
  assert.equal((await db.collection("activityRecords").findOne({ _id: submitted.activity._id })).approvedQuantity, 10);
});

test("automatic weekly report separates quantities, proportional points, bonuses and statuses", async () => {
  const ids = await seedSchool();
  await db.collection(SCORING_MODE_COLLECTION).updateOne(
    { schoolId: ids.schoolId },
    { $set: { effectiveAt: new Date("2026-11-09T03:00:00Z") } },
  );
  await db.collection("weeklyScoreLedgers").insertOne({
    _id: new ObjectId(), companyId: ids.companyId, schoolId: ids.schoolId,
    studentId: ids.studentId, categoryId: ids.categoryId,
    weekStart: "2026-11-09", weekEnd: "2026-11-15",
    configurationSnapshot: {
      schoolId: ids.schoolId.toHexString(), categoryId: ids.categoryId.toHexString(),
      targetQuantity: 20, maximumPoints: 100, frozenAt: new Date("2026-11-09T12:00:00Z"),
    },
    approvedQuantity: 10, calculatedPoints: 50, creditedPoints: 50,
    revision: 1, createdAt: new Date("2026-11-09T12:00:00Z"), updatedAt: new Date("2026-11-09T12:00:00Z"),
  });
  const submitted = await submitActivity(client, db, submission(ids));
  await processActivityApproval(client, db, approval(ids, submitted.activity._id));
  await db.collection("activityRecords").insertMany([
    { _id: new ObjectId(), companyId: ids.companyId, schoolId: ids.schoolId, studentId: ids.studentId, categoryId: ids.categoryId, weekStart: "2026-11-16", status: "pending", reviewedByEducatorId: null, submissionIdempotencyKey: "report-pending" },
    { _id: new ObjectId(), companyId: ids.companyId, schoolId: ids.schoolId, studentId: ids.studentId, categoryId: ids.categoryId, weekStart: "2026-11-16", status: "corrected", reviewedByEducatorId: ids.educatorId, submissionIdempotencyKey: "report-corrected" },
    { _id: new ObjectId(), companyId: ids.companyId, schoolId: ids.schoolId, studentId: ids.studentId, categoryId: ids.categoryId, weekStart: "2026-11-16", status: "rejected", reviewedByEducatorId: ids.educatorId, submissionIdempotencyKey: "report-rejected" },
  ]);
  await db.collection("pointEvents").insertMany([
    { _id: new ObjectId(), companyId: ids.companyId, schoolId: ids.schoolId, studentId: ids.studentId, categoryId: ids.categoryId, source: "special_bonus", points: 100, createdAt: new Date("2026-11-20T12:00:00Z") },
    { _id: new ObjectId(), companyId: ids.companyId, schoolId: ids.schoolId, studentId: ids.studentId, categoryId: null, source: "referral", points: 50, createdAt: new Date("2026-11-20T13:00:00Z") },
  ]);
  await db.collection("categories").updateOne({ _id: ids.categoryId }, { $set: { weeklyGoal: 999, active: false } });

  const period = periodForWeekStart("2026-11-16");
  const closed = await closeWeeklyReport(db, ids.schoolId, period, new Date("2026-11-23T12:00:00Z"));
  assert.equal(closed.created, true);
  assert.equal(closed.report.reportVersion, 2);
  assert.equal(closed.report.scoringMode, "automatic");
  assert.equal(closed.report.summary.approvedQuantity, 10);
  assert.equal(closed.report.summary.pointsAwarded, 100);
  assert.equal(closed.report.summary.specialBonusPoints, 100);
  assert.equal(closed.report.summary.pendingActivities, 1);
  assert.equal(closed.report.summary.approvedActivities, 1);
  assert.equal(closed.report.summary.correctedActivities, 1);
  assert.equal(closed.report.summary.rejectedActivities, 1);
  const metric = closed.report.studentMetrics[0].categoryMetrics[0];
  assert.equal(metric.goal, 10);
  assert.equal(metric.realized, 10);
  assert.equal(metric.creditedPoints, 100);
  assert.equal(metric.performancePercentage, 100);
  assert.equal(metric.previousRealized, 10);
  assert.equal(metric.previousPerformancePercentage, 50);
  assert.equal(metric.evolutionDeltaPercentagePoints, 50);
  assert.equal(closed.report.categoryMetrics[0].weeklyGoal, 10);
  assert.equal(closed.report.classMetrics[0].approvedQuantity, 10);
  assert.equal(closed.report.classMetrics[0].creditedPoints, 100);

  const original = JSON.stringify(closed.report);
  await db.collection("categories").updateOne({ _id: ids.categoryId }, { $set: { weeklyGoal: 1 } });
  const repeated = await closeWeeklyReport(db, ids.schoolId, period, new Date("2026-11-23T13:00:00Z"));
  assert.equal(repeated.created, false);
  assert.equal(JSON.stringify(repeated.report), original);
});

test("automatic credits flow through ranking, history, store redemption and remain school-isolated", async () => {
  const ids = await seedSchool();
  await db.collection("users").updateOne(
    { _id: ids.studentId },
    { $set: { name: "Aluno integrado", email: "aluno@teste.local" } },
  );
  await db.collection("categories").updateOne(
    { _id: ids.categoryId },
    { $set: { name: "Leitura", weeklyGoal: 3, defaultPoints: 10 } },
  );
  const first = await submitActivity(client, db, submission(ids, {
    reportedQuantity: 1, pageReached: 12, idempotencyKey: "integrated-submission-first",
  }));
  assert.equal(first.activity.pageReached, 12);
  const firstApproval = await processActivityApproval(client, db, approval(ids, first.activity._id, {
    approvedQuantity: 1, idempotencyKey: "integrated-approval-first",
  }));
  assert.equal(firstApproval.pointsDifference, 4, "one third of 10 rounds up");

  const second = await submitActivity(client, db, submission(ids, {
    reportedQuantity: 2, pageReached: 25, idempotencyKey: "integrated-submission-second",
  }));
  const secondApproval = await processActivityApproval(client, db, approval(ids, second.activity._id, {
    approvedQuantity: 2, idempotencyKey: "integrated-approval-second",
  }));
  assert.equal(secondApproval.pointsDifference, 6);
  assert.equal(secondApproval.calculatedPoints, 10, "accumulated credit stops at the configured maximum");
  assert.equal((await db.collection("users").findOne({ _id: ids.studentId })).points, 10);

  const token = `integration-session-${ids.studentId}`;
  await db.collection("sessions").insertOne({
    token, userId: ids.studentId, expiresAt: new Date("2030-01-01T00:00:00Z"),
  });
  const { GET: rankingGet } = loadRoute("src/app/api/rankings/route.ts", {
    "@/lib/mongodb": temporaryClientPromiseMock,
    "@/lib/auth": { schoolExists: async (schoolId) => schoolId.equals(ids.schoolId) },
  });
  const rankingResponse = await rankingGet(requestWithSession(
    `http://localhost/api/rankings?categoryId=${ids.categoryId}`, token,
  ));
  assert.equal(rankingResponse.status, 200);
  const ranking = await rankingResponse.json();
  assert.equal(ranking.totalStudents, 1);
  assert.equal(ranking.ranking[0].student.id, ids.studentId.toHexString());
  assert.equal(ranking.ranking[0].points, 10);

  const { GET: historyGet } = loadRoute("src/app/api/points/history/route.ts", {
    "@/lib/mongodb": temporaryClientPromiseMock,
  });
  const historyResponse = await historyGet(requestWithSession("http://localhost/api/points/history", token));
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.total, 2);
  assert.deepEqual(history.history.map((event) => event.points).sort((a, b) => a - b), [4, 6]);

  const productId = new ObjectId();
  await db.collection("pointStoreProducts").insertOne({
    _id: productId, schoolId: ids.schoolId, name: "Prêmio integrado", points: 7, stock: 1, active: true,
  });
  const { POST: redeemPost } = loadRoute("src/app/api/point-store/redeem/route.ts", {
    "@/lib/mongodb": temporaryClientPromiseMock,
    "@/lib/subscription-access": {
      getOperationalAccessForAuth: async () => ({ canPerformOperationalMutation: true }),
      subscriptionPastDueResponse: { error: "blocked" },
    },
  });
  const redemptionResponse = await redeemPost(requestWithSession(
    "http://localhost/api/point-store/redeem", token, { productId: productId.toHexString() },
  ));
  assert.equal(redemptionResponse.status, 201);
  const redemption = await redemptionResponse.json();
  assert.equal(redemption.redemption.remainingPoints, 3);
  assert.equal((await db.collection("users").findOne({ _id: ids.studentId })).points, 3);
  assert.equal((await db.collection("pointStoreProducts").findOne({ _id: productId })).stock, 0);
  assert.equal(await db.collection("pointStoreRedemptions").countDocuments({ studentId: ids.studentId }), 1);
  assert.equal(await db.collection("pointEvents").countDocuments({ studentId: ids.studentId, source: "point_store", points: -7 }), 1);

  assert.equal(await db.collection("pointEvents").countDocuments({ schoolId: ids.otherSchoolId }), 0);
  const foreignRankingResponse = await rankingGet(requestWithSession(
    `http://localhost/api/rankings?categoryId=${ids.categoryId}&schoolId=${ids.otherSchoolId}`, token,
  ));
  assert.equal(foreignRankingResponse.status, 200, "student-provided schoolId cannot escape the session school");
  assert.equal((await foreignRankingResponse.json()).ranking[0].points, 10, "store spending does not reduce pedagogical category ranking");
});

test("forced rollback leaves no partial balance and legacy mode remains the default", async () => {
  const ids = await seedSchool({ automatic: false });
  await assert.rejects(() => submitActivity(client, db, submission(ids)), ActivitySubmissionModeError);
  assert.equal((await db.collection("activityRecords").countDocuments()), 0);
  assert.equal((await db.collection("weeklyScoreLedgers").countDocuments()), 0);
  assert.equal((await db.collection("users").findOne({ _id: ids.studentId })).points, 0);

  const session = client.startSession();
  try {
    await assert.rejects(() => session.withTransaction(async () => {
      await db.collection("users").updateOne(
        { _id: ids.studentId }, { $inc: { points: 999 } }, { session },
      );
      await db.collection("pointEvents").insertOne({
        _id: new ObjectId(), studentId: ids.studentId, schoolId: ids.schoolId, points: 999,
      }, { session });
      throw new Error("forced integration rollback");
    }), /forced integration rollback/);
  } finally {
    await session.endSession();
  }
  assert.equal((await db.collection("users").findOne({ _id: ids.studentId })).points, 0);
  assert.equal((await db.collection("pointEvents").countDocuments()), 0);
});

test("fictitious pilot returns to legacy on Monday without rewriting automatic history", async () => {
  const ids = await seedSchool();
  const submitted = await submitActivity(client, db, submission(ids, {
    reportedQuantity: 15,
    idempotencyKey: "pilot-fictitious-submission",
  }));
  await processActivityApproval(client, db, approval(ids, submitted.activity._id, {
    approvedQuantity: 15,
    idempotencyKey: "pilot-fictitious-approval",
  }));
  await db.collection("pointEvents").insertOne({
    _id: new ObjectId(), companyId: ids.companyId, schoolId: ids.schoolId,
    studentId: ids.studentId, categoryId: ids.categoryId, source: "special_bonus",
    points: 100, idempotencyKey: "pilot-special-bonus-100",
    createdAt: new Date("2026-11-20T12:00:00Z"),
  });

  const period = periodForWeekStart("2026-11-16");
  const closed = await closeWeeklyReport(db, ids.schoolId, period, new Date("2026-11-23T12:00:00Z"));
  assert.equal(closed.report.reportVersion, 2);
  assert.equal(closed.report.summary.pointsAwarded, 100, "quantity above goal remains capped");
  assert.equal(closed.report.summary.specialBonusPoints, 100);
  const historicalReport = JSON.stringify(closed.report);
  const historicalEvents = await db.collection("pointEvents").countDocuments({ schoolId: ids.schoolId });

  const scheduled = await scheduleSchoolScoringMode(client, db, {
    companyId: ids.companyId, schoolId: ids.schoolId, actorId: ids.educatorId,
    actorRole: "admin", futureMode: "legacy", idempotencyKey: "pilot-return-to-legacy",
    now: new Date("2026-11-24T12:00:00Z"),
  });
  assert.equal(scheduled.change.effectiveAt.toISOString(), "2026-11-30T03:00:00.000Z");
  assert.equal(await getEffectiveSchoolScoringMode(db, ids.schoolId, new Date("2026-11-30T02:59:59Z")), "automatic");
  assert.equal(await getEffectiveSchoolScoringMode(db, ids.schoolId, new Date("2026-11-30T03:00:00Z")), "legacy");
  assert.equal(await getEffectiveSchoolScoringMode(db, ids.otherSchoolId, new Date("2026-12-01T12:00:00Z")), "legacy");
  await assert.rejects(
    () => submitActivity(client, db, submission(ids, {
      activityAt: new Date("2026-12-01T12:00:00Z"), now: new Date("2026-12-01T13:00:00Z"),
      idempotencyKey: "pilot-after-return-to-legacy",
    })),
    ActivitySubmissionModeError,
  );
  assert.equal(await db.collection("pointEvents").countDocuments({ schoolId: ids.schoolId }), historicalEvents);
  assert.equal(JSON.stringify(await db.collection("weeklyReports").findOne({ _id: closed.report._id })), historicalReport);
});
