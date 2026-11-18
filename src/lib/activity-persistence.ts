import { ObjectId, type Db } from "mongodb";

import { getActivityWeek } from "./weekly-calendar.ts";
import { calculatePointsDifference, calculateProportionalPoints } from "./weekly-scoring.ts";
import type { WeeklyScoringConfigurationSnapshot } from "./weekly-scoring-types.ts";
import {
  ACTIVITY_COLLECTIONS,
  type ActivityAuditEvent,
  type ActivityBookReference,
  type ActivityDecisionPlan,
  type ActivityPersistenceIndex,
  type ActivityRecord,
  type ActivitySubmissionPersistencePlan,
  type ActivityStatus,
  type WeeklyScoreLedger,
} from "./activity-persistence-types.ts";

export class ActivityPersistenceValidationError extends Error {}
export class ActivityPersistenceConflictError extends Error {}
export class ActivityPersistenceScopeError extends Error {}

export const ACTIVITY_PERSISTENCE_INDEXES: readonly ActivityPersistenceIndex[] = [
  { collection: ACTIVITY_COLLECTIONS.records, keys: { schoolId: 1, submissionIdempotencyKey: 1 }, options: { name: "activity_submission_idempotency", unique: true } },
  { collection: ACTIVITY_COLLECTIONS.records, keys: { schoolId: 1, studentId: 1, weekStart: 1, activityAt: -1 }, options: { name: "activity_school_student_week" } },
  { collection: ACTIVITY_COLLECTIONS.records, keys: { schoolId: 1, categoryId: 1, weekStart: 1, status: 1 }, options: { name: "activity_school_category_week" } },
  { collection: ACTIVITY_COLLECTIONS.records, keys: { companyId: 1, schoolId: 1, status: 1, activityAt: -1 }, options: { name: "activity_company_school_status" } },
  { collection: ACTIVITY_COLLECTIONS.ledgers, keys: { schoolId: 1, studentId: 1, categoryId: 1, weekStart: 1 }, options: { name: "weekly_ledger_identity", unique: true } },
  { collection: ACTIVITY_COLLECTIONS.ledgers, keys: { companyId: 1, schoolId: 1, weekStart: 1 }, options: { name: "weekly_ledger_company_school_week" } },
  { collection: ACTIVITY_COLLECTIONS.auditEvents, keys: { schoolId: 1, idempotencyKey: 1 }, options: { name: "activity_audit_idempotency", unique: true } },
  { collection: ACTIVITY_COLLECTIONS.auditEvents, keys: { schoolId: 1, activityRecordId: 1, occurredAt: 1 }, options: { name: "activity_audit_record_timeline" } },
  { collection: ACTIVITY_COLLECTIONS.adjustmentPendencies, keys: { schoolId: 1, idempotencyKey: 1 }, options: { name: "activity_adjustment_idempotency", unique: true } },
  { collection: ACTIVITY_COLLECTIONS.adjustmentPendencies, keys: { schoolId: 1, status: 1, createdAt: 1 }, options: { name: "activity_adjustment_school_status" } },
];

export async function ensureActivityPersistenceIndexes(db: Pick<Db, "collection">): Promise<void> {
  for (const index of ACTIVITY_PERSISTENCE_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options);
  }
}

function requireObjectId(value: unknown, field: string): asserts value is ObjectId {
  if (!(value instanceof ObjectId)) throw new ActivityPersistenceValidationError(`${field} must be an ObjectId`);
}

function requireDate(value: unknown, field: string): asserts value is Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new ActivityPersistenceValidationError(`${field} must be a valid Date`);
  }
}

function requireNonNegativeFinite(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ActivityPersistenceValidationError(`${field} must be a non-negative finite number`);
  }
}

function requireOptionalPage(value: unknown): asserts value is number | null {
  if (value !== null && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)) {
    throw new ActivityPersistenceValidationError("pageReached must be null or a positive safe integer");
  }
}

function normalizeIdempotencyKey(value: unknown, field: string): string {
  if (typeof value !== "string") throw new ActivityPersistenceValidationError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 160) {
    throw new ActivityPersistenceValidationError(`${field} must contain 8 to 160 characters`);
  }
  return normalized;
}

function normalizeBook(book: ActivityBookReference | null | undefined): ActivityBookReference | null {
  if (!book) return null;
  const normalize = (value: string | null): string | null => {
    if (value === null) return null;
    if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 300) {
      throw new ActivityPersistenceValidationError("book fields must be null or non-empty strings up to 300 characters");
    }
    return value.trim();
  };
  const normalized = { bookId: normalize(book.bookId), title: normalize(book.title), isbn: normalize(book.isbn) };
  if (!normalized.bookId && !normalized.title && !normalized.isbn) {
    throw new ActivityPersistenceValidationError("book must contain at least one reference");
  }
  return normalized;
}

function sameId(left: ObjectId, right: ObjectId): boolean {
  return left.equals(right);
}

function assertSameScope(activity: ActivityRecord, ledger: WeeklyScoreLedger): void {
  if (!sameId(activity.companyId, ledger.companyId)
    || !sameId(activity.schoolId, ledger.schoolId)
    || !sameId(activity.studentId, ledger.studentId)
    || !sameId(activity.categoryId, ledger.categoryId)
    || activity.weekStart !== ledger.weekStart) {
    throw new ActivityPersistenceScopeError("activity and ledger must belong to the same company, school, student, category and week");
  }
}

function validateSnapshot(snapshot: WeeklyScoringConfigurationSnapshot, schoolId: ObjectId, categoryId: ObjectId): void {
  if (snapshot.schoolId !== schoolId.toHexString() || snapshot.categoryId !== categoryId.toHexString()) {
    throw new ActivityPersistenceScopeError("configuration snapshot must match the ledger school and category");
  }
  calculateProportionalPoints({ approvedQuantity: 0, targetQuantity: snapshot.targetQuantity, maximumPoints: snapshot.maximumPoints });
  requireDate(snapshot.frozenAt, "configurationSnapshot.frozenAt");
}

export function buildActivityRecord(input: {
  id?: ObjectId;
  companyId: ObjectId;
  schoolId: ObjectId;
  studentId: ObjectId;
  categoryId: ObjectId;
  activityAt: Date;
  reportedQuantity: number;
  pageReached?: number | null;
  book?: ActivityBookReference | null;
  submissionIdempotencyKey: string;
  now?: Date;
}): ActivityRecord {
  requireObjectId(input.companyId, "companyId");
  requireObjectId(input.schoolId, "schoolId");
  requireObjectId(input.studentId, "studentId");
  requireObjectId(input.categoryId, "categoryId");
  requireDate(input.activityAt, "activityAt");
  requireNonNegativeFinite(input.reportedQuantity, "reportedQuantity");
  if (input.reportedQuantity === 0) throw new ActivityPersistenceValidationError("reportedQuantity must be greater than zero");
  const pageReached = input.pageReached ?? null;
  requireOptionalPage(pageReached);
  const now = input.now ?? new Date();
  requireDate(now, "now");
  const week = getActivityWeek(input.activityAt);

  return {
    _id: input.id ?? new ObjectId(),
    companyId: input.companyId,
    schoolId: input.schoolId,
    studentId: input.studentId,
    categoryId: input.categoryId,
    activityAt: new Date(input.activityAt),
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    reportedQuantity: input.reportedQuantity,
    approvedQuantity: null,
    pageReached,
    book: normalizeBook(input.book),
    status: "pending",
    reviewedByEducatorId: null,
    reviewedAt: null,
    submissionIdempotencyKey: normalizeIdempotencyKey(input.submissionIdempotencyKey, "submissionIdempotencyKey"),
    lastDecisionIdempotencyKey: null,
    revision: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function buildWeeklyLedgerInsert(input: {
  id?: ObjectId;
  companyId: ObjectId;
  schoolId: ObjectId;
  studentId: ObjectId;
  categoryId: ObjectId;
  weekStart: string;
  weekEnd: string;
  configurationSnapshot: WeeklyScoringConfigurationSnapshot;
  now?: Date;
}): WeeklyScoreLedger {
  for (const [field, value] of Object.entries({ companyId: input.companyId, schoolId: input.schoolId, studentId: input.studentId, categoryId: input.categoryId })) {
    requireObjectId(value, field);
  }
  validateSnapshot(input.configurationSnapshot, input.schoolId, input.categoryId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.weekEnd)) {
    throw new ActivityPersistenceValidationError("ledger week boundaries must use YYYY-MM-DD");
  }
  const now = input.now ?? new Date();
  requireDate(now, "now");
  return {
    _id: input.id ?? new ObjectId(),
    companyId: input.companyId,
    schoolId: input.schoolId,
    studentId: input.studentId,
    categoryId: input.categoryId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    configurationSnapshot: { ...input.configurationSnapshot, frozenAt: new Date(input.configurationSnapshot.frozenAt) },
    approvedQuantity: 0,
    calculatedPoints: 0,
    creditedPoints: 0,
    revision: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function buildWeeklyLedgerUpsert(ledger: WeeklyScoreLedger) {
  return {
    filter: {
      schoolId: ledger.schoolId,
      studentId: ledger.studentId,
      categoryId: ledger.categoryId,
      weekStart: ledger.weekStart,
    },
    update: { $setOnInsert: ledger },
    options: { upsert: true as const },
  };
}

/**
 * Contract for the future submission service. Activity insert, ledger upsert and
 * submitted audit must be applied in one transaction before the activity is exposed.
 */
export function buildActivitySubmissionPersistencePlan(input: {
  activity: ActivityRecord;
  configurationSnapshot: WeeklyScoringConfigurationSnapshot;
  actorId: ObjectId;
  actorRole?: "student" | "educator";
  auditEventId?: ObjectId;
  now?: Date;
}): ActivitySubmissionPersistencePlan {
  requireObjectId(input.actorId, "actorId");
  const actorRole = input.actorRole ?? "student";
  if (actorRole === "student" && !sameId(input.actorId, input.activity.studentId)) {
    throw new ActivityPersistenceScopeError("submission actor must be the activity student");
  }
  if (input.activity.status !== "pending" || input.activity.revision !== 0) {
    throw new ActivityPersistenceConflictError("only a new pending activity can be submitted");
  }
  const now = input.now ?? input.activity.createdAt;
  requireDate(now, "now");
  const ledger = buildWeeklyLedgerInsert({
    companyId: input.activity.companyId,
    schoolId: input.activity.schoolId,
    studentId: input.activity.studentId,
    categoryId: input.activity.categoryId,
    weekStart: input.activity.weekStart,
    weekEnd: input.activity.weekEnd,
    configurationSnapshot: input.configurationSnapshot,
    now,
  });
  return {
    activity: input.activity,
    ledgerOnInsert: ledger,
    ledgerUpsert: buildWeeklyLedgerUpsert(ledger),
    auditEvent: {
      _id: input.auditEventId ?? new ObjectId(),
      companyId: input.activity.companyId,
      schoolId: input.activity.schoolId,
      studentId: input.activity.studentId,
      categoryId: input.activity.categoryId,
      activityRecordId: input.activity._id,
      weekStart: input.activity.weekStart,
      type: "submitted",
      actorId: input.actorId,
      actorRole,
      idempotencyKey: input.activity.submissionIdempotencyKey,
      before: null,
      after: { status: "pending", approvedQuantity: null, revision: 0 },
      quantityDelta: 0,
      calculatedPointsDelta: 0,
      creditedPointsDelta: 0,
      pointEventId: null,
      justification: null,
      occurredAt: new Date(now),
    },
  };
}

export function assertFrozenConfiguration(
  ledger: WeeklyScoreLedger,
  proposed: WeeklyScoringConfigurationSnapshot,
): void {
  const frozen = ledger.configurationSnapshot;
  if (frozen.schoolId !== proposed.schoolId
    || frozen.categoryId !== proposed.categoryId
    || frozen.targetQuantity !== proposed.targetQuantity
    || frozen.maximumPoints !== proposed.maximumPoints
    || frozen.frozenAt.getTime() !== proposed.frozenAt.getTime()) {
    throw new ActivityPersistenceConflictError("weekly scoring configuration is already frozen");
  }
}

function nextStatus(
  current: ActivityStatus,
  requested: Exclude<ActivityStatus, "pending">,
): Exclude<ActivityStatus, "pending"> {
  if (current === "pending") return requested;
  return requested === "rejected" ? "rejected" : "corrected";
}

export function buildActivityDecisionPlan(input: {
  activity: ActivityRecord;
  ledger: WeeklyScoreLedger;
  schoolId: ObjectId;
  educatorId: ObjectId;
  actorRole: "educator" | "admin" | "super_admin";
  decision: "approved" | "corrected" | "rejected";
  approvedQuantity: number;
  decisionIdempotencyKey: string;
  justification?: string | null;
  expectedActivityRevision: number;
  expectedLedgerRevision: number;
  auditEventId?: ObjectId;
  now?: Date;
}): ActivityDecisionPlan {
  const { activity, ledger } = input;
  requireObjectId(input.schoolId, "schoolId");
  requireObjectId(input.educatorId, "educatorId");
  if (!sameId(activity.schoolId, input.schoolId) || !sameId(ledger.schoolId, input.schoolId)) {
    throw new ActivityPersistenceScopeError("activity decision is outside the selected school");
  }
  assertSameScope(activity, ledger);
  if (activity.revision !== input.expectedActivityRevision || ledger.revision !== input.expectedLedgerRevision) {
    throw new ActivityPersistenceConflictError("stale activity or weekly ledger revision");
  }
  const decisionIdempotencyKey = normalizeIdempotencyKey(input.decisionIdempotencyKey, "decisionIdempotencyKey");
  const justification = typeof input.justification === "string" ? input.justification.trim() : "";
  if ((input.decision === "corrected" || input.decision === "rejected") && justification.length < 3) {
    throw new ActivityPersistenceValidationError("corrected or rejected activities require a justification");
  }
  if (justification.length > 500) throw new ActivityPersistenceValidationError("justification must contain at most 500 characters");
  if (activity.lastDecisionIdempotencyKey === decisionIdempotencyKey) {
    throw new ActivityPersistenceConflictError("activity decision was already applied");
  }
  requireNonNegativeFinite(input.approvedQuantity, "approvedQuantity");
  if (input.decision === "rejected" && input.approvedQuantity !== 0) {
    throw new ActivityPersistenceValidationError("rejected activities must have zero approved quantity");
  }
  if (input.decision !== "rejected" && input.approvedQuantity === 0) {
    throw new ActivityPersistenceValidationError("approved or corrected activities must have a positive approved quantity");
  }
  const now = input.now ?? new Date();
  requireDate(now, "now");
  const previousApprovedQuantity = activity.approvedQuantity ?? 0;
  const quantityDelta = input.approvedQuantity - previousApprovedQuantity;
  const nextLedgerQuantity = ledger.approvedQuantity + quantityDelta;
  if (nextLedgerQuantity < 0) throw new ActivityPersistenceConflictError("weekly approved quantity cannot become negative");
  const calculatedPoints = calculateProportionalPoints({
    approvedQuantity: nextLedgerQuantity,
    targetQuantity: ledger.configurationSnapshot.targetQuantity,
    maximumPoints: ledger.configurationSnapshot.maximumPoints,
  });
  const calculatedPointsDelta = calculatePointsDifference(ledger.calculatedPoints, calculatedPoints).difference;
  const status = nextStatus(activity.status, input.decision);
  const nextActivity: ActivityRecord = {
    ...activity,
    approvedQuantity: input.approvedQuantity,
    status,
    reviewedByEducatorId: input.educatorId,
    reviewedAt: new Date(now),
    lastDecisionIdempotencyKey: decisionIdempotencyKey,
    revision: activity.revision + 1,
    updatedAt: new Date(now),
  };
  const nextLedger: WeeklyScoreLedger = {
    ...ledger,
    approvedQuantity: nextLedgerQuantity,
    calculatedPoints,
    revision: ledger.revision + 1,
    updatedAt: new Date(now),
  };
  const auditEvent: ActivityAuditEvent = {
    _id: input.auditEventId ?? new ObjectId(),
    companyId: activity.companyId,
    schoolId: activity.schoolId,
    studentId: activity.studentId,
    categoryId: activity.categoryId,
    activityRecordId: activity._id,
    weekStart: activity.weekStart,
    type: status,
    actorId: input.educatorId,
    actorRole: input.actorRole,
    idempotencyKey: decisionIdempotencyKey,
    before: { status: activity.status, approvedQuantity: activity.approvedQuantity, revision: activity.revision },
    after: { status, approvedQuantity: input.approvedQuantity, revision: nextActivity.revision },
    quantityDelta,
    calculatedPointsDelta,
    creditedPointsDelta: 0,
    pointEventId: null,
    justification: justification || null,
    occurredAt: new Date(now),
  };

  return {
    activityFilter: { _id: activity._id, schoolId: input.schoolId, revision: input.expectedActivityRevision },
    activityUpdate: {
      $set: {
        approvedQuantity: nextActivity.approvedQuantity,
        status: nextActivity.status,
        reviewedByEducatorId: nextActivity.reviewedByEducatorId,
        reviewedAt: nextActivity.reviewedAt,
        lastDecisionIdempotencyKey: nextActivity.lastDecisionIdempotencyKey,
        revision: nextActivity.revision,
        updatedAt: nextActivity.updatedAt,
      },
    },
    ledgerFilter: { _id: ledger._id, schoolId: input.schoolId, revision: input.expectedLedgerRevision },
    ledgerUpdate: {
      $set: {
        approvedQuantity: nextLedger.approvedQuantity,
        calculatedPoints: nextLedger.calculatedPoints,
        revision: nextLedger.revision,
        updatedAt: nextLedger.updatedAt,
      },
    },
    auditEvent,
    nextActivity,
    nextLedger,
  };
}
