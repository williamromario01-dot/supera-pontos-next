import { type Db, type MongoClient } from "mongodb";
import { automaticActivityScoringEnabled } from "./school-scoring-mode.ts";
import { buildActivityRecord, ActivityPersistenceConflictError, ActivityPersistenceValidationError } from "./activity-persistence.ts";
import { ACTIVITY_COLLECTIONS, type ActivityRecord } from "./activity-persistence-types.ts";
import { getActivityWeek } from "./weekly-calendar.ts";
import { processActivityApprovalInTransaction, type ActivityApprovalResult } from "./activity-approval-service.ts";
import { submitActivityInTransaction, type SubmitActivityInput } from "./activity-submission-service.ts";

type ServiceClient = Pick<MongoClient, "startSession">;
type ServiceDb = Pick<Db, "collection">;

export type ClassroomActivityInput = Omit<SubmitActivityInput, "actorRole" | "idempotencyKey"> & {
  readonly actorRole: "educator";
  readonly idempotencyKey: string;
  readonly observation?: string | null;
};

export type ClassroomActivityResult = {
  readonly duplicate: boolean;
  readonly activity: ActivityRecord;
  readonly approval: ActivityApprovalResult;
};

export async function registerAndApproveClassroomActivity(
  client: ServiceClient,
  db: ServiceDb,
  input: ClassroomActivityInput,
): Promise<ClassroomActivityResult> {
  const key = input.idempotencyKey?.trim();
  if (!key || key.length < 8 || key.length > 140) throw new ActivityPersistenceValidationError("idempotencyKey must contain 8 to 140 characters");
  const observation = input.observation?.trim() || null;
  if (observation && observation.length > 500) throw new ActivityPersistenceValidationError("observation must contain at most 500 characters");
  const now = input.now ?? new Date();
  const activity = buildActivityRecord({
    companyId: input.companyId, schoolId: input.schoolId, studentId: input.studentId, categoryId: input.categoryId,
    activityAt: input.activityAt, reportedQuantity: input.reportedQuantity, pageReached: input.pageReached,
    book: input.book, submissionIdempotencyKey: `${key}:submit`, now,
  });
  if (now >= getActivityWeek(input.activityAt).closesAt) throw new ActivityPersistenceConflictError("activity week is already closed");
  const session = client.startSession();
  let result: ClassroomActivityResult | null = null;
  try {
    await session.withTransaction(async () => {
      const activities = db.collection<ActivityRecord>(ACTIVITY_COLLECTIONS.records);
      const existing = await activities.findOne({ schoolId: input.schoolId, submissionIdempotencyKey: `${key}:submit` }, { session });
      if (!existing) {
        const equivalent = await activities.findOne({
          schoolId: input.schoolId, studentId: input.studentId, categoryId: input.categoryId,
          weekStart: activity.weekStart, status: "pending",
        }, { session });
        if (equivalent) throw new ActivityPersistenceConflictError("Existe uma atividade pendente equivalente. Resolva-a antes de registrar uma atividade presencial.");
      }
      const submission = await submitActivityInTransaction(db, { ...input, idempotencyKey: `${key}:submit` }, activity, now, session);
      if (!submission.duplicate) {
        await activities.updateOne({ _id: submission.activity._id, schoolId: input.schoolId }, { $set: { source: "classroom", observation, registeredByEducatorId: input.actorId } }, { session });
      }
      const approval = await processActivityApprovalInTransaction(db, {
        activityId: submission.activity._id, schoolId: input.schoolId, educatorId: input.actorId,
        actorRole: "educator", authorizedStudentIds: [input.studentId], decision: "approved",
        approvedQuantity: input.reportedQuantity, idempotencyKey: `${key}:approve`, expectedActivityRevision: 0,
        automaticScoringEnabled: automaticActivityScoringEnabled(), justification: "Atividade presencial registrada e aprovada pelo educador.", now,
      }, now, session);
      const saved = await activities.findOne({ _id: submission.activity._id, schoolId: input.schoolId }, { session });
      if (!saved) throw new ActivityPersistenceConflictError("classroom activity was not persisted");
      result = { duplicate: submission.duplicate || approval.duplicate, activity: saved, approval };
    });
  } finally { await session.endSession(); }
  if (!result) throw new ActivityPersistenceConflictError("classroom activity transaction produced no result");
  return result;
}
