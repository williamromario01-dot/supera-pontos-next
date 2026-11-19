import { ObjectId, type Db, type Document, type MongoClient } from "mongodb";

import { buildActivityDecisionPlan, ActivityPersistenceConflictError, ActivityPersistenceScopeError, ActivityPersistenceValidationError } from "./activity-persistence.ts";
import { ACTIVITY_COLLECTIONS, type ActivityAdjustmentPendency, type ActivityAuditEvent, type ActivityRecord, type WeeklyScoreLedger } from "./activity-persistence-types.ts";
import { calculatePointsDifference } from "./weekly-scoring.ts";

export class ActivityAdjustmentAuthorizationError extends Error {}
export class ActivityAdjustmentNotFoundError extends Error {}
export class ActivityAdjustmentBlockedError extends Error {}

type ServiceDb = Pick<Db, "collection">;
type ServiceClient = Pick<MongoClient, "startSession">;
type AdminRole = "admin" | "super_admin";

export interface DecideActivityAdjustmentInput {
  pendencyId: ObjectId; schoolId: ObjectId; actorId: ObjectId; actorRole: AdminRole;
  action: "resolve" | "cancel"; justification: string; idempotencyKey: string; now?: Date;
}

function matched(result: { matchedCount: number }, message: string) {
  if (result.matchedCount !== 1) throw new ActivityPersistenceConflictError(message);
}

function validate(input: DecideActivityAdjustmentInput) {
  if (![input.pendencyId, input.schoolId, input.actorId].every((value) => value instanceof ObjectId)) throw new ActivityPersistenceValidationError("pendencyId, schoolId and actorId must be ObjectIds");
  if (input.actorRole !== "admin" && input.actorRole !== "super_admin") throw new ActivityAdjustmentAuthorizationError("profile cannot decide adjustment pendencies");
  if (input.action !== "resolve" && input.action !== "cancel") throw new ActivityPersistenceValidationError("invalid adjustment action");
  if (input.justification?.trim().length < 3 || input.justification.trim().length > 500) throw new ActivityPersistenceValidationError("justification must contain 3 to 500 characters");
  if (input.idempotencyKey?.trim().length < 8 || input.idempotencyKey.trim().length > 160) throw new ActivityPersistenceValidationError("idempotencyKey must contain 8 to 160 characters");
}

export async function listActivityAdjustmentPendencies(db: ServiceDb, schoolId: ObjectId) {
  return db.collection<ActivityAdjustmentPendency>(ACTIVITY_COLLECTIONS.adjustmentPendencies)
    .find({ schoolId, status: "open" }).sort({ createdAt: 1 }).limit(100).toArray();
}

export async function decideActivityAdjustment(client: ServiceClient, db: ServiceDb, input: DecideActivityAdjustmentInput) {
  validate(input);
  const now = input.now ?? new Date();
  const key = input.idempotencyKey.trim();
  const note = input.justification.trim();
  const session = client.startSession();
  let result: Document | null = null;
  try {
    await session.withTransaction(async () => {
      const pendencies = db.collection<ActivityAdjustmentPendency>(ACTIVITY_COLLECTIONS.adjustmentPendencies);
      const audits = db.collection<ActivityAuditEvent>(ACTIVITY_COLLECTIONS.auditEvents);
      const activities = db.collection<ActivityRecord>(ACTIVITY_COLLECTIONS.records);
      const ledgers = db.collection<WeeklyScoreLedger>(ACTIVITY_COLLECTIONS.ledgers);
      const users = db.collection("users");
      const pointEvents = db.collection("pointEvents");
      const pendency = await pendencies.findOne({ _id: input.pendencyId, schoolId: input.schoolId }, { session });
      if (!pendency) throw new ActivityAdjustmentNotFoundError("adjustment pendency was not found");
      if (pendency.status !== "open") {
        if (pendency.resolutionIdempotencyKey === key && pendency.resolutionAction === input.action) {
          result = { duplicate: true, status: pendency.status, pendencyId: pendency._id };
          return;
        }
        throw new ActivityPersistenceConflictError("adjustment pendency was already decided");
      }
      const activity = await activities.findOne({ _id: pendency.activityRecordId, schoolId: input.schoolId }, { session });
      const ledger = await ledgers.findOne({ _id: pendency.weeklyScoreLedgerId, schoolId: input.schoolId }, { session });
      const student = await users.findOne({ _id: pendency.studentId, schoolId: input.schoolId, companyId: pendency.companyId, role: "student", active: { $ne: false } }, { session });
      if (!activity || !ledger || !student) throw new ActivityPersistenceScopeError("adjustment dependencies are outside the selected school");
      if (activity.revision !== pendency.activityRevisionAtRequest || ledger.revision !== pendency.ledgerRevisionAtRequest) throw new ActivityAdjustmentBlockedError("activity or ledger changed after the pendency was created");

      if (input.action === "cancel") {
        matched(await pendencies.updateOne({ _id: pendency._id, schoolId: input.schoolId, status: "open" }, { $set: { status: "cancelled", resolvedAt: now, resolvedBy: input.actorId, resolutionNote: note, resolutionIdempotencyKey: key, resolutionAction: "cancel", updatedAt: now } }, { session }), "adjustment pendency changed concurrently");
        await audits.insertOne({
          _id: new ObjectId(), companyId: pendency.companyId, schoolId: pendency.schoolId, studentId: pendency.studentId,
          categoryId: pendency.categoryId, activityRecordId: pendency.activityRecordId, weekStart: activity.weekStart,
          type: "adjustment_cancelled", actorId: input.actorId, actorRole: input.actorRole, idempotencyKey: key,
          before: { status: activity.status, approvedQuantity: activity.approvedQuantity, revision: activity.revision },
          after: { status: activity.status, approvedQuantity: activity.approvedQuantity, revision: activity.revision },
          quantityDelta: 0, calculatedPointsDelta: 0, creditedPointsDelta: 0, pointEventId: null,
          justification: note, occurredAt: now,
        }, { session });
        result = { duplicate: false, status: "cancelled", pendencyId: pendency._id, resultingBalance: Number(student.points ?? 0) };
        return;
      }

      const balance = Number(student.points ?? 0);
      if (!Number.isSafeInteger(balance) || balance < pendency.requiredPointsReversal) throw new ActivityAdjustmentBlockedError("student balance is still insufficient for the required reversal");
      const plan = buildActivityDecisionPlan({
        activity, ledger, schoolId: input.schoolId, educatorId: input.actorId, actorRole: input.actorRole,
        decision: pendency.requestedStatus, approvedQuantity: pendency.requestedApprovedQuantity,
        decisionIdempotencyKey: key, justification: note,
        expectedActivityRevision: activity.revision, expectedLedgerRevision: ledger.revision, now,
      });
      const difference = calculatePointsDifference(ledger.creditedPoints, plan.nextLedger.calculatedPoints).difference;
      if (difference !== -pendency.requiredPointsReversal || difference >= 0) throw new ActivityAdjustmentBlockedError("requested correction no longer matches the protected reversal");
      matched(await activities.updateOne(plan.activityFilter, plan.activityUpdate, { session }), "activity changed concurrently");
      matched(await ledgers.updateOne(plan.ledgerFilter, { ...plan.ledgerUpdate, $set: { ...(plan.ledgerUpdate.$set as Document), creditedPoints: plan.nextLedger.calculatedPoints } }, { session }), "ledger changed concurrently");
      const pointEventId = new ObjectId();
      await pointEvents.insertOne({ _id: pointEventId, studentId: pendency.studentId, categoryId: pendency.categoryId, educatorId: input.actorId, points: difference, createdAt: now, companyId: pendency.companyId, schoolId: pendency.schoolId, source: "weekly_activity", activityRecordId: pendency.activityRecordId, weeklyScoreLedgerId: pendency.weeklyScoreLedgerId, idempotencyKey: key, compensating: true, administrativeAdjustment: true }, { session });
      matched(await users.updateOne({ _id: pendency.studentId, companyId: pendency.companyId, schoolId: input.schoolId, role: "student", active: { $ne: false }, points: { $gte: -difference } }, { $inc: { points: difference }, $set: { updatedAt: now } }, { session }), "student balance changed or is insufficient");
      matched(await pendencies.updateOne({ _id: pendency._id, schoolId: input.schoolId, status: "open" }, { $set: { status: "resolved", resolvedAt: now, resolvedBy: input.actorId, resolutionNote: note, resolutionIdempotencyKey: key, resolutionAction: "resolve", updatedAt: now } }, { session }), "adjustment pendency changed concurrently");
      await audits.insertOne({ ...plan.auditEvent, creditedPointsDelta: difference, pointEventId }, { session });
      result = { duplicate: false, status: "resolved", pendencyId: pendency._id, pointEventId, pointsDifference: difference, resultingBalance: balance + difference };
    });
  } finally { await session.endSession(); }
  if (!result) throw new ActivityPersistenceConflictError("adjustment decision produced no result");
  return result;
}
