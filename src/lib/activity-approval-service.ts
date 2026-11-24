import {
  ObjectId,
  type ClientSession,
  type Db,
  type Document,
  type MongoClient,
} from "mongodb";

import {
  ACTIVITY_COLLECTIONS,
  type ActivityAdjustmentPendency,
  type ActivityAuditEvent,
  type ActivityRecord,
  type WeeklyScoreLedger,
} from "./activity-persistence-types.ts";
import { LEARNING_COLLECTIONS } from "./learning-rhythm-model.ts";
import {
  ActivityPersistenceConflictError,
  ActivityPersistenceScopeError,
  ActivityPersistenceValidationError,
  buildActivityDecisionPlan,
  buildWeeklyLedgerInsert,
} from "./activity-persistence.ts";
import { getActivityWeek } from "./weekly-calendar.ts";
import { calculatePointsDifference } from "./weekly-scoring.ts";
import {
  automaticActivityScoringEnabled,
  requireSchoolScoringMode,
  ScoringModeConflictError,
} from "./school-scoring-mode.ts";

export type ActivityApprovalRole = "educator" | "admin" | "super_admin" | "company_admin";

export class ActivityApprovalAuthorizationError extends Error {}
export class ActivityApprovalClosedWeekError extends Error {}
export class ActivityApprovalNotFoundError extends Error {}
export class ActivityApprovalDisabledError extends Error {}

export interface ActivityApprovalResult {
  readonly state: "applied" | "duplicate" | "pending_adjustment";
  readonly duplicate: boolean;
  readonly activityId: ObjectId;
  readonly ledgerId: ObjectId;
  readonly pointEventId: ObjectId | null;
  readonly pointsDifference: number;
  readonly resultingBalance: number;
  readonly activityRevision: number;
  readonly ledgerRevision: number;
  readonly adjustmentPendencyId: ObjectId | null;
  readonly approvedQuantity: number;
  readonly targetQuantity: number;
  readonly maximumPoints: number;
  readonly calculatedPoints: number;
}

export interface ActivityApprovalInput {
  readonly activityId: ObjectId;
  readonly schoolId: ObjectId;
  readonly educatorId: ObjectId;
  readonly actorRole: ActivityApprovalRole;
  readonly authorizedStudentIds?: readonly ObjectId[];
  readonly decision: "approved" | "corrected" | "rejected";
  readonly approvedQuantity: number;
  readonly idempotencyKey: string;
  readonly expectedActivityRevision: number;
  readonly now?: Date;
  /** Must be supplied by the trusted server entry point; defaults fail closed. */
  readonly automaticScoringEnabled?: boolean;
  readonly justification?: string | null;
}

type ServiceClient = Pick<MongoClient, "startSession">;
type ServiceDb = Pick<Db, "collection">;

function sameId(left: unknown, right: ObjectId): boolean {
  return left instanceof ObjectId ? left.equals(right) : String(left) === right.toHexString();
}

function requireMatched(result: { matchedCount: number }, message: string): void {
  if (result.matchedCount !== 1) throw new ActivityPersistenceConflictError(message);
}

function authorize(
  input: ActivityApprovalInput,
  activity: ActivityRecord,
): asserts input is ActivityApprovalInput & { actorRole: Exclude<ActivityApprovalRole, "company_admin"> } {
  if (input.actorRole === "company_admin") {
    throw new ActivityApprovalAuthorizationError("company administrators cannot approve pedagogical activities");
  }
  if (!sameId(activity.schoolId, input.schoolId)) {
    throw new ActivityPersistenceScopeError("activity is outside the selected school");
  }
  if (input.actorRole === "educator") {
    const allowed = input.authorizedStudentIds ?? [];
    if (!allowed.some((studentId) => sameId(activity.studentId, studentId))) {
      throw new ActivityApprovalAuthorizationError("educator is not assigned to this student");
    }
  }
}

function categoryConfiguration(category: Document): { targetQuantity: number; maximumPoints: number } {
  const targetQuantity = category.weeklyGoal;
  const maximumPoints = category.defaultPoints;
  if (typeof targetQuantity !== "number" || !Number.isFinite(targetQuantity) || targetQuantity <= 0) {
    throw new ActivityPersistenceValidationError("category weeklyGoal must be a positive finite number");
  }
  if (!Number.isSafeInteger(maximumPoints) || maximumPoints < 0) {
    throw new ActivityPersistenceValidationError("category defaultPoints must be a non-negative safe integer");
  }
  return { targetQuantity, maximumPoints };
}

function resultFromAudit(audit: ActivityAuditEvent, ledger: WeeklyScoreLedger, balance: number): ActivityApprovalResult {
  return {
    state: "duplicate",
    duplicate: true,
    activityId: audit.activityRecordId,
    ledgerId: ledger._id,
    pointEventId: audit.pointEventId,
    pointsDifference: audit.creditedPointsDelta,
    resultingBalance: balance,
    activityRevision: audit.after.revision,
    ledgerRevision: ledger.revision,
    adjustmentPendencyId: null,
    approvedQuantity: ledger.approvedQuantity,
    targetQuantity: ledger.configurationSnapshot.targetQuantity,
    maximumPoints: ledger.configurationSnapshot.maximumPoints,
    calculatedPoints: ledger.calculatedPoints,
  };
}

export async function processActivityApproval(
  client: ServiceClient,
  db: ServiceDb,
  input: ActivityApprovalInput,
): Promise<ActivityApprovalResult> {
  if (!(input.activityId instanceof ObjectId) || !(input.schoolId instanceof ObjectId) || !(input.educatorId instanceof ObjectId)) {
    throw new ActivityPersistenceValidationError("activityId, schoolId and educatorId must be ObjectIds");
  }
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length < 8 || input.idempotencyKey.trim().length > 160) {
    throw new ActivityPersistenceValidationError("idempotencyKey must contain 8 to 160 characters");
  }
  if (!Number.isSafeInteger(input.expectedActivityRevision) || input.expectedActivityRevision < 0) {
    throw new ActivityPersistenceValidationError("expectedActivityRevision must be a non-negative safe integer");
  }
  if (input.actorRole === "super_admin" && !input.schoolId) {
    throw new ActivityApprovalAuthorizationError("super administrator must select a school");
  }
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new ActivityPersistenceValidationError("now must be a valid Date");
  }
  if (!(input.automaticScoringEnabled ?? automaticActivityScoringEnabled())) {
    throw new ActivityApprovalDisabledError("automatic activity scoring is disabled");
  }

  const session = client.startSession();
  let outcome: ActivityApprovalResult | null = null;
  try {
    await session.withTransaction(async () => {
      outcome = await processActivityApprovalInTransaction(db, input, now, session);
    });
  } finally {
    await session.endSession();
  }
  if (!outcome) throw new ActivityPersistenceConflictError("activity approval transaction produced no result");
  return outcome;
}

export async function processActivityApprovalInTransaction(
  db: ServiceDb,
  input: ActivityApprovalInput,
  now: Date,
  session: ClientSession,
): Promise<ActivityApprovalResult> {
  const activities = db.collection<ActivityRecord>(ACTIVITY_COLLECTIONS.records);
  const ledgers = db.collection<WeeklyScoreLedger>(ACTIVITY_COLLECTIONS.ledgers);
  const audits = db.collection<ActivityAuditEvent>(ACTIVITY_COLLECTIONS.auditEvents);
  const users = db.collection("users");
  const categories = db.collection("categories");
  const pointEvents = db.collection("pointEvents");
  const pendencies = db.collection<ActivityAdjustmentPendency>(ACTIVITY_COLLECTIONS.adjustmentPendencies);

  const pendingAdjustment = await pendencies.findOne({ schoolId: input.schoolId, idempotencyKey: input.idempotencyKey.trim() }, { session });
  if (pendingAdjustment) {
    if (!sameId(pendingAdjustment.activityRecordId, input.activityId) || !sameId(pendingAdjustment.requestedBy, input.educatorId)) {
      throw new ActivityPersistenceConflictError("idempotency key belongs to another adjustment request");
    }
    const pendingLedger = await ledgers.findOne({ _id: pendingAdjustment.weeklyScoreLedgerId, schoolId: input.schoolId }, { session });
    const pendingStudent = await users.findOne({ _id: pendingAdjustment.studentId, schoolId: input.schoolId, role: "student" }, { session });
    if (!pendingLedger || !pendingStudent) throw new ActivityPersistenceConflictError("pending adjustment result is incomplete");
    return {
      state: "pending_adjustment",
      duplicate: true,
      activityId: pendingAdjustment.activityRecordId,
      ledgerId: pendingAdjustment.weeklyScoreLedgerId,
      pointEventId: null,
      pointsDifference: 0,
      resultingBalance: Number(pendingStudent.points ?? 0),
      activityRevision: input.expectedActivityRevision,
      ledgerRevision: pendingLedger.revision,
      adjustmentPendencyId: pendingAdjustment._id,
      approvedQuantity: pendingLedger.approvedQuantity,
      targetQuantity: pendingLedger.configurationSnapshot.targetQuantity,
      maximumPoints: pendingLedger.configurationSnapshot.maximumPoints,
      calculatedPoints: pendingLedger.calculatedPoints,
    };
  }

  const duplicate = await audits.findOne({ schoolId: input.schoolId, idempotencyKey: input.idempotencyKey.trim() }, { session });
  if (duplicate) {
    if (!sameId(duplicate.activityRecordId, input.activityId) || !sameId(duplicate.actorId, input.educatorId)) {
      throw new ActivityPersistenceConflictError("idempotency key belongs to another activity decision");
    }
    const ledger = await ledgers.findOne({ schoolId: input.schoolId, studentId: duplicate.studentId, categoryId: duplicate.categoryId, weekStart: duplicate.weekStart }, { session });
    const student = await users.findOne({ _id: duplicate.studentId, schoolId: input.schoolId, role: "student" }, { session });
    if (!ledger || !student) throw new ActivityPersistenceConflictError("idempotent approval result is incomplete");
    return resultFromAudit(duplicate, ledger, Number(student.points ?? 0));
  }

  const activity = await activities.findOne({ _id: input.activityId, schoolId: input.schoolId }, { session });
  if (!activity) throw new ActivityApprovalNotFoundError("activity was not found in the selected school");
  authorize(input, activity);
  if (activity.revision !== input.expectedActivityRevision) {
    throw new ActivityPersistenceConflictError("activity was concurrently modified");
  }
  const activityWeek = getActivityWeek(activity.activityAt);
  if (now >= activityWeek.closesAt) throw new ActivityApprovalClosedWeekError("activity week is already closed");
  try {
    await requireSchoolScoringMode(db, input.schoolId, "automatic", now, session);
  } catch (error) {
    if (error instanceof ScoringModeConflictError) throw new ActivityApprovalDisabledError(error.message);
    throw error;
  }

  const student = await users.findOne({
    _id: activity.studentId,
    companyId: activity.companyId,
    schoolId: input.schoolId,
    role: "student",
    active: { $ne: false },
  }, { session });
  if (!student) throw new ActivityPersistenceScopeError("student is not active in the activity school and company");
  const category = await categories.findOne({ _id: activity.categoryId, schoolId: { $in: [input.schoolId, input.schoolId.toHexString()] }, active: { $ne: false } }, { session });
  if (!category) throw new ActivityPersistenceScopeError("category is not active in the activity school");

  let ledger = await ledgers.findOne({
    schoolId: input.schoolId,
    studentId: activity.studentId,
    categoryId: activity.categoryId,
    weekStart: activity.weekStart,
  }, { session });
  if (!ledger) {
    const configuration = categoryConfiguration(category);
    ledger = buildWeeklyLedgerInsert({
      companyId: activity.companyId,
      schoolId: activity.schoolId,
      studentId: activity.studentId,
      categoryId: activity.categoryId,
      weekStart: activity.weekStart,
      weekEnd: activity.weekEnd,
      configurationSnapshot: {
        schoolId: activity.schoolId.toHexString(),
        categoryId: activity.categoryId.toHexString(),
        targetQuantity: configuration.targetQuantity,
        maximumPoints: configuration.maximumPoints,
        frozenAt: now,
      },
      now,
    });
    await ledgers.insertOne(ledger, { session });
  }

  const plan = buildActivityDecisionPlan({
    activity,
    ledger,
    schoolId: input.schoolId,
    educatorId: input.educatorId,
    actorRole: input.actorRole,
    decision: input.decision,
    approvedQuantity: input.approvedQuantity,
    decisionIdempotencyKey: input.idempotencyKey,
    justification: input.justification,
    expectedActivityRevision: activity.revision,
    expectedLedgerRevision: ledger.revision,
    now,
  });
  const pointsDifference = calculatePointsDifference(ledger.creditedPoints, plan.nextLedger.calculatedPoints).difference;
  const currentBalance = Number(student.points ?? 0);
  if (!Number.isSafeInteger(currentBalance) || currentBalance < 0) {
    throw new ActivityPersistenceValidationError("student points balance is invalid");
  }
  if (pointsDifference < 0 && currentBalance + pointsDifference < 0) {
    const pendingAdjustment: ActivityAdjustmentPendency = {
      _id: new ObjectId(),
      companyId: activity.companyId,
      schoolId: activity.schoolId,
      studentId: activity.studentId,
      categoryId: activity.categoryId,
      activityRecordId: activity._id,
      weeklyScoreLedgerId: ledger._id,
      requestedBy: input.educatorId,
      idempotencyKey: input.idempotencyKey.trim(),
      requestedStatus: input.decision,
      requestedApprovedQuantity: input.approvedQuantity,
      requiredPointsReversal: -pointsDifference,
      balanceAtRequest: currentBalance,
      activityRevisionAtRequest: activity.revision,
      ledgerRevisionAtRequest: ledger.revision,
      status: "open",
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      resolutionIdempotencyKey: null,
      resolutionAction: null,
    };
    await pendencies.insertOne(pendingAdjustment, { session });
    return {
      state: "pending_adjustment",
      duplicate: false,
      activityId: activity._id,
      ledgerId: ledger._id,
      pointEventId: null,
      pointsDifference: 0,
      resultingBalance: currentBalance,
      activityRevision: activity.revision,
      ledgerRevision: ledger.revision,
      adjustmentPendencyId: pendingAdjustment._id,
      approvedQuantity: ledger.approvedQuantity,
      targetQuantity: ledger.configurationSnapshot.targetQuantity,
      maximumPoints: ledger.configurationSnapshot.maximumPoints,
      calculatedPoints: ledger.calculatedPoints,
    };
  }

  requireMatched(await activities.updateOne(plan.activityFilter, plan.activityUpdate, { session }), "activity was concurrently modified");
  requireMatched(await ledgers.updateOne(plan.ledgerFilter, {
    ...plan.ledgerUpdate,
    $set: { ...(plan.ledgerUpdate.$set as Document), creditedPoints: plan.nextLedger.calculatedPoints },
  }, { session }), "weekly ledger was concurrently modified");

  let pointEventId: ObjectId | null = null;
  if (pointsDifference !== 0) {
    pointEventId = new ObjectId();
    await pointEvents.insertOne({
      _id: pointEventId,
      studentId: activity.studentId,
      categoryId: activity.categoryId,
      educatorId: input.educatorId,
      points: pointsDifference,
      createdAt: now,
      companyId: activity.companyId,
      schoolId: activity.schoolId,
      source: "weekly_activity",
      activityRecordId: activity._id,
      weeklyScoreLedgerId: ledger._id,
      idempotencyKey: input.idempotencyKey.trim(),
      compensating: pointsDifference < 0,
    }, { session });
    const balanceFilter: Document = { _id: activity.studentId, companyId: activity.companyId, schoolId: input.schoolId, role: "student", active: { $ne: false } };
    if (pointsDifference < 0) balanceFilter.points = { $gte: -pointsDifference };
    requireMatched(await users.updateOne(balanceFilter, { $inc: { points: pointsDifference }, $set: { updatedAt: now } }, { session }), "student balance changed or is insufficient");
  }

  const auditEvent: ActivityAuditEvent = {
    ...plan.auditEvent,
    creditedPointsDelta: pointsDifference,
    pointEventId,
  };
  await audits.insertOne(auditEvent, { session });
  // O progresso de livro é uma dimensão pedagógica separada dos pontos. A mesma
  // decisão idempotente que atualiza a atividade aplica apenas o delta aprovado.
  if (activity.book?.bookId && ObjectId.isValid(activity.book.bookId)) {
    await db.collection(LEARNING_COLLECTIONS.assignments).updateOne({
      schoolId: activity.schoolId, studentId: activity.studentId,
      bookId: new ObjectId(activity.book.bookId), categoryId: activity.categoryId, active: { $ne: false },
    }, {
      $inc: { completedQuestions: plan.auditEvent.quantityDelta },
      $set: { lastValidActivityAt: now, updatedAt: now },
    }, { session });
  }
  return {
    state: "applied",
    duplicate: false,
    activityId: activity._id,
    ledgerId: ledger._id,
    pointEventId,
    pointsDifference,
    resultingBalance: currentBalance + pointsDifference,
    activityRevision: plan.nextActivity.revision,
    ledgerRevision: plan.nextLedger.revision,
    adjustmentPendencyId: null,
    approvedQuantity: plan.nextLedger.approvedQuantity,
    targetQuantity: plan.nextLedger.configurationSnapshot.targetQuantity,
    maximumPoints: plan.nextLedger.configurationSnapshot.maximumPoints,
    calculatedPoints: plan.nextLedger.calculatedPoints,
  };
}
