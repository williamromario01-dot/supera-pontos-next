import { ObjectId, type ClientSession, type Db, type Document, type MongoClient } from "mongodb";

import { categoryBelongsToSchool, isProtectedLegacyCategory } from "./category-scope.ts";
import { ACTIVITY_COLLECTIONS, type ActivityRecord, type WeeklyScoreLedger } from "./activity-persistence-types.ts";
import {
  ActivityPersistenceConflictError,
  ActivityPersistenceScopeError,
  ActivityPersistenceValidationError,
  buildActivityRecord,
  buildActivitySubmissionPersistencePlan,
} from "./activity-persistence.ts";
import { getActivityWeek } from "./weekly-calendar.ts";
import { requireSchoolScoringMode, ScoringModeConflictError } from "./school-scoring-mode.ts";
import { LEARNING_COLLECTIONS } from "./learning-rhythm-model.ts";

export type ActivitySubmissionRole = "student" | "educator";
export class ActivitySubmissionAuthorizationError extends Error {}
export class ActivitySubmissionClosedWeekError extends Error {}
export class ActivitySubmissionNotFoundError extends Error {}
export class ActivitySubmissionModeError extends Error {}

export function activitySubmissionsEnabled(
  environment: { readonly ACTIVITY_SUBMISSIONS_ENABLED?: string } = process.env as { readonly ACTIVITY_SUBMISSIONS_ENABLED?: string },
): boolean {
  return environment.ACTIVITY_SUBMISSIONS_ENABLED === "true";
}

export interface SubmitActivityInput {
  readonly actorId: ObjectId;
  readonly actorRole: ActivitySubmissionRole;
  readonly companyId: ObjectId;
  readonly schoolId: ObjectId;
  readonly studentId: ObjectId;
  readonly categoryId: ObjectId;
  readonly activityAt: Date;
  readonly reportedQuantity: number;
  readonly pageReached?: number | null;
  readonly book?: { bookId: string | null; title: string | null; isbn: string | null } | null;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface SubmitActivityResult {
  readonly duplicate: boolean;
  readonly activity: ActivityRecord;
  readonly ledger: WeeklyScoreLedger;
}

type ServiceClient = Pick<MongoClient, "startSession">;
type ServiceDb = Pick<Db, "collection">;
const variants = (id: ObjectId) => [id, id.toHexString()];

async function authorizedEducatorStudent(db: ServiceDb, schoolId: ObjectId, educatorId: ObjectId, studentId: ObjectId, session?: ClientSession) {
  return Boolean(await db.collection("classes").findOne({
    schoolId: { $in: variants(schoolId) }, educatorId: { $in: variants(educatorId) },
    studentIds: { $in: variants(studentId) }, active: { $ne: false },
  }, { projection: { _id: 1 }, session }));
}

async function effectiveCategory(db: ServiceDb, schoolId: ObjectId, categoryId: ObjectId, session: ClientSession): Promise<Document> {
  const category = await db.collection("categories").findOne({ _id: categoryId }, { session });
  if (!category || !categoryBelongsToSchool(category, schoolId)) throw new ActivityPersistenceScopeError("category is outside the selected school");
  const override = isProtectedLegacyCategory(category)
    ? await db.collection("categoryOverrides").findOne({ schoolId, categoryId }, { session })
    : null;
  const effective: Document = { ...category, ...override, _id: category._id };
  if (effective.active === false) throw new ActivityPersistenceScopeError("category is inactive for the selected school");
  if (typeof effective.weeklyGoal !== "number" || !Number.isFinite(effective.weeklyGoal) || effective.weeklyGoal <= 0) throw new ActivityPersistenceValidationError("effective weeklyGoal must be positive");
  if (!Number.isSafeInteger(effective.defaultPoints) || effective.defaultPoints < 0) throw new ActivityPersistenceValidationError("effective defaultPoints must be a non-negative integer");
  return effective;
}

export async function submitActivity(client: ServiceClient, db: ServiceDb, input: SubmitActivityInput): Promise<SubmitActivityResult> {
  const now = input.now ?? new Date();
  const activity = buildActivityRecord({
    companyId: input.companyId, schoolId: input.schoolId, studentId: input.studentId, categoryId: input.categoryId,
    activityAt: input.activityAt, reportedQuantity: input.reportedQuantity, pageReached: input.pageReached,
    book: input.book, submissionIdempotencyKey: input.idempotencyKey, now,
  });
  if (now >= getActivityWeek(input.activityAt).closesAt) throw new ActivitySubmissionClosedWeekError("activity week is already closed");
  const session = client.startSession();
  let result: SubmitActivityResult | null = null;
  try {
    await session.withTransaction(async () => { result = await submitInTransaction(db, input, activity, now, session); });
  } finally { await session.endSession(); }
  if (!result) throw new ActivityPersistenceConflictError("activity submission transaction produced no result");
  return result;
}

async function submitInTransaction(db: ServiceDb, input: SubmitActivityInput, activity: ActivityRecord, now: Date, session: ClientSession): Promise<SubmitActivityResult> {
  const activities = db.collection<ActivityRecord>(ACTIVITY_COLLECTIONS.records);
  const ledgers = db.collection<WeeklyScoreLedger>(ACTIVITY_COLLECTIONS.ledgers);
  const school = await db.collection("schools").findOne({ _id: input.schoolId, companyId: input.companyId, active: { $ne: false }, status: { $ne: "archived" } }, { session });
  if (!school) throw new ActivitySubmissionNotFoundError("school was not found or is inactive");
  try { await requireSchoolScoringMode(db, input.schoolId, "automatic", now, session); }
  catch (error) { if (error instanceof ScoringModeConflictError) throw new ActivitySubmissionModeError(error.message); throw error; }
  const duplicate = await activities.findOne({ schoolId: input.schoolId, submissionIdempotencyKey: input.idempotencyKey.trim() }, { session });
  if (duplicate) {
    if (!duplicate.studentId.equals(input.studentId) || !duplicate.categoryId.equals(input.categoryId)) throw new ActivityPersistenceConflictError("idempotency key belongs to another submission");
    if (input.actorRole === "student" && !input.actorId.equals(input.studentId)) throw new ActivitySubmissionAuthorizationError("students can submit only their own activities");
    if (input.actorRole === "educator" && !(await authorizedEducatorStudent(db, input.schoolId, input.actorId, input.studentId, session))) throw new ActivitySubmissionAuthorizationError("educator is not assigned to this student");
    const submissionAudit = await db.collection(ACTIVITY_COLLECTIONS.auditEvents).findOne({ schoolId: input.schoolId, activityRecordId: duplicate._id, type: "submitted" }, { session });
    if (!submissionAudit || String(submissionAudit.actorId) !== String(input.actorId)) throw new ActivityPersistenceConflictError("idempotency key belongs to another actor");
    const ledger = await ledgers.findOne({ schoolId: input.schoolId, studentId: duplicate.studentId, categoryId: duplicate.categoryId, weekStart: duplicate.weekStart }, { session });
    if (!ledger) throw new ActivityPersistenceConflictError("duplicate submission has no frozen ledger");
    return { duplicate: true, activity: duplicate, ledger };
  }
  const student = await db.collection("users").findOne({ _id: input.studentId, companyId: input.companyId, schoolId: { $in: variants(input.schoolId) }, role: "student", active: { $ne: false } }, { session });
  if (!student) throw new ActivitySubmissionNotFoundError("student was not found in the selected school");
  if (input.actorRole === "student" && !input.actorId.equals(input.studentId)) throw new ActivitySubmissionAuthorizationError("students can submit only their own activities");
  if (input.actorRole === "educator" && !(await authorizedEducatorStudent(db, input.schoolId, input.actorId, input.studentId, session))) throw new ActivitySubmissionAuthorizationError("educator is not assigned to this student");
  const category = await effectiveCategory(db, input.schoolId, input.categoryId, session);
  if (activity.book?.bookId) {
    if (!ObjectId.isValid(activity.book.bookId)) throw new ActivityPersistenceValidationError("book reference is invalid");
    const assignment = await db.collection(LEARNING_COLLECTIONS.assignments).findOne({
      schoolId: input.schoolId, studentId: input.studentId, bookId: new ObjectId(activity.book.bookId),
      categoryId: input.categoryId, active: { $ne: false },
    }, { session });
    if (!assignment) throw new ActivityPersistenceScopeError("book is not actively assigned to this student and category");
  }
  const plan = buildActivitySubmissionPersistencePlan({
    activity,
    actorId: input.actorId,
    actorRole: input.actorRole,
    configurationSnapshot: { schoolId: input.schoolId.toHexString(), categoryId: input.categoryId.toHexString(), targetQuantity: category.weeklyGoal, maximumPoints: category.defaultPoints, frozenAt: now },
    now,
  });
  await ledgers.updateOne(plan.ledgerUpsert.filter, plan.ledgerUpsert.update, { ...plan.ledgerUpsert.options, session });
  const frozenLedger = await ledgers.findOne(plan.ledgerUpsert.filter, { session });
  if (!frozenLedger) throw new ActivityPersistenceConflictError("weekly configuration could not be frozen");
  await activities.insertOne(plan.activity, { session });
  await db.collection(ACTIVITY_COLLECTIONS.auditEvents).insertOne(plan.auditEvent, { session });
  return { duplicate: false, activity: plan.activity, ledger: frozenLedger };
}

export async function activityVisibilityFilter(db: ServiceDb, input: { actorId: ObjectId; actorRole: "student" | "educator" | "admin" | "super_admin"; schoolId: ObjectId; pendingOnly?: boolean }) {
  const filter: Document = { schoolId: input.schoolId };
  if (input.pendingOnly) filter.status = "pending";
  if (input.actorRole === "student") filter.studentId = input.actorId;
  if (input.actorRole === "educator") {
    const classes = await db.collection("classes").find({ schoolId: { $in: variants(input.schoolId) }, educatorId: { $in: variants(input.actorId) }, active: { $ne: false } }, { projection: { studentIds: 1 } }).toArray();
    filter.studentId = { $in: [...new Map(classes.flatMap((row) => Array.isArray(row.studentIds) ? row.studentIds : []).filter((id) => ObjectId.isValid(String(id))).map((id) => [String(id), new ObjectId(String(id))])).values()] };
  }
  return filter;
}
