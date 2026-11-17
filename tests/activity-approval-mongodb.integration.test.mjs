import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient, ObjectId } from "mongodb";

import { processActivityApproval } from "../src/lib/activity-approval-service.ts";
import { buildActivityRecord, ensureActivityPersistenceIndexes } from "../src/lib/activity-persistence.ts";
import { SCORING_MODE_COLLECTION, SCORING_MODE_INDEXES } from "../src/lib/school-scoring-mode.ts";

const testUri = process.env.MONGODB_ACTIVITY_TEST_URI;
const enabled = typeof testUri === "string" && testUri.length > 0;

function testDatabaseName(uri) {
  const withoutQuery = uri.split("?")[0];
  return withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
}

test("MongoDB replica-set integration: indexes, concurrency, idempotency and rollback", { skip: !enabled, timeout: 60_000 }, async () => {
  assert.notEqual(testUri, process.env.MONGODB_URI, "test URI must not equal the application MongoDB URI");
  const databaseName = testDatabaseName(testUri);
  assert.match(databaseName, /(test|dev|local)/i, "test database name must contain test, dev or local");
  const client = new MongoClient(testUri, { serverSelectionTimeoutMS: 5_000 });
  await client.connect();
  const db = client.db(databaseName);
  try {
    const hello = await db.admin().command({ hello: 1 });
    assert.ok(hello.setName, "MongoDB test instance must be a replica set with transaction support");
    await db.dropDatabase();
    await ensureActivityPersistenceIndexes(db);
    await db.collection(SCORING_MODE_COLLECTION).createIndexes(SCORING_MODE_INDEXES.map((index) => ({ key: index.keys, ...index.options })));

    const companyId = new ObjectId(), schoolId = new ObjectId(), studentId = new ObjectId(), categoryId = new ObjectId(), educatorId = new ObjectId();
    const activity = buildActivityRecord({ companyId, schoolId, studentId, categoryId, activityAt: new Date("2026-11-18T15:00:00Z"), reportedQuantity: 3, submissionIdempotencyKey: "integration-submission-001", now: new Date("2026-11-18T16:00:00Z") });
    await Promise.all([
      db.collection("activityRecords").insertOne(activity),
      db.collection("users").insertOne({ _id: studentId, companyId, schoolId, role: "student", active: true, points: 0 }),
      db.collection("categories").insertOne({ _id: categoryId, schoolId, active: true, weeklyGoal: 10, defaultPoints: 100 }),
      db.collection(SCORING_MODE_COLLECTION).insertOne({ _id: new ObjectId(), companyId, schoolId, previousMode: "legacy", futureMode: "automatic", requestedBy: educatorId, requestedByRole: "admin", requestedAt: new Date("2026-11-15T12:00:00Z"), effectiveAt: new Date("2026-11-16T03:00:00Z"), idempotencyKey: "integration-mode-001" }),
    ]);
    const base = { activityId: activity._id, schoolId, educatorId, actorRole: "educator", authorizedStudentIds: [studentId], decision: "approved", approvedQuantity: 3, expectedActivityRevision: 0, now: new Date("2026-11-19T12:00:00Z"), automaticScoringEnabled: true };
    const concurrent = await Promise.allSettled([
      processActivityApproval(client, db, { ...base, idempotencyKey: "integration-approval-a" }),
      processActivityApproval(client, db, { ...base, idempotencyKey: "integration-approval-b" }),
    ]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await db.collection("pointEvents").countDocuments()), 1);
    assert.equal((await db.collection("users").findOne({ _id: studentId })).points, 30);

    const winner = concurrent.find((result) => result.status === "fulfilled").value;
    const winningKey = winner.pointEventId
      ? (await db.collection("pointEvents").findOne({ _id: winner.pointEventId })).idempotencyKey
      : null;
    const repeated = await processActivityApproval(client, db, { ...base, idempotencyKey: winningKey });
    assert.equal(repeated.duplicate, true);
    assert.equal((await db.collection("pointEvents").countDocuments()), 1);

    const existingLedger = await db.collection("weeklyScoreLedgers").findOne({ schoolId });
    await assert.rejects(
      () => db.collection("weeklyScoreLedgers").insertOne({ ...existingLedger, _id: new ObjectId() }),
      (error) => error?.code === 11000,
    );

    const rollbackSession = client.startSession();
    try {
      await assert.rejects(() => rollbackSession.withTransaction(async () => {
        await db.collection("users").updateOne({ _id: studentId }, { $inc: { points: 999 } }, { session: rollbackSession });
        throw new Error("forced integration rollback");
      }), /forced integration rollback/);
    } finally {
      await rollbackSession.endSession();
    }
    assert.equal((await db.collection("users").findOne({ _id: studentId })).points, 30);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
