import type { ObjectId } from "mongodb";

import type { WeeklyScoringConfigurationSnapshot } from "./weekly-scoring-types.ts";

export const ACTIVITY_COLLECTIONS = {
  records: "activityRecords",
  ledgers: "weeklyScoreLedgers",
  auditEvents: "activityAuditEvents",
  adjustmentPendencies: "activityAdjustmentPendencies",
} as const;

export type ActivityStatus = "pending" | "approved" | "corrected" | "rejected";
export type ActivityAuditEventType = "submitted" | "approved" | "corrected" | "rejected";

export interface ActivityBookReference {
  readonly bookId: string | null;
  readonly title: string | null;
  readonly isbn: string | null;
}

export interface ActivityRecord {
  readonly _id: ObjectId;
  readonly companyId: ObjectId;
  readonly schoolId: ObjectId;
  readonly studentId: ObjectId;
  readonly categoryId: ObjectId;
  readonly activityAt: Date;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly reportedQuantity: number;
  readonly approvedQuantity: number | null;
  readonly pageReached: number | null;
  readonly book: ActivityBookReference | null;
  readonly status: ActivityStatus;
  readonly reviewedByEducatorId: ObjectId | null;
  readonly reviewedAt: Date | null;
  readonly submissionIdempotencyKey: string;
  readonly lastDecisionIdempotencyKey: string | null;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WeeklyScoreLedger {
  readonly _id: ObjectId;
  readonly companyId: ObjectId;
  readonly schoolId: ObjectId;
  readonly studentId: ObjectId;
  readonly categoryId: ObjectId;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly configurationSnapshot: WeeklyScoringConfigurationSnapshot;
  readonly approvedQuantity: number;
  readonly calculatedPoints: number;
  /** Total already materialized in pointEvents and users.points. */
  readonly creditedPoints: number;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ActivityAuditSnapshot {
  readonly status: ActivityStatus;
  readonly approvedQuantity: number | null;
  readonly revision: number;
}

export interface ActivityAuditEvent {
  readonly _id: ObjectId;
  readonly companyId: ObjectId;
  readonly schoolId: ObjectId;
  readonly studentId: ObjectId;
  readonly categoryId: ObjectId;
  readonly activityRecordId: ObjectId;
  readonly weekStart: string;
  readonly type: ActivityAuditEventType;
  readonly actorId: ObjectId;
  readonly actorRole: "student" | "educator" | "admin" | "super_admin";
  readonly idempotencyKey: string;
  readonly before: ActivityAuditSnapshot | null;
  readonly after: ActivityAuditSnapshot;
  readonly quantityDelta: number;
  readonly calculatedPointsDelta: number;
  readonly creditedPointsDelta: number;
  readonly pointEventId: ObjectId | null;
  readonly justification: string | null;
  readonly occurredAt: Date;
}

export interface ActivityPersistenceIndex {
  readonly collection: (typeof ACTIVITY_COLLECTIONS)[keyof typeof ACTIVITY_COLLECTIONS];
  readonly keys: Readonly<Record<string, 1 | -1>>;
  readonly options: Readonly<{
    name: string;
    unique?: boolean;
  }>;
}

export interface ActivityDecisionPlan {
  readonly activityFilter: Readonly<Record<string, unknown>>;
  readonly activityUpdate: Readonly<Record<string, unknown>>;
  readonly ledgerFilter: Readonly<Record<string, unknown>>;
  readonly ledgerUpdate: Readonly<Record<string, unknown>>;
  readonly auditEvent: ActivityAuditEvent;
  readonly nextActivity: ActivityRecord;
  readonly nextLedger: WeeklyScoreLedger;
}

export interface ActivityAdjustmentPendency {
  readonly _id: ObjectId;
  readonly companyId: ObjectId;
  readonly schoolId: ObjectId;
  readonly studentId: ObjectId;
  readonly categoryId: ObjectId;
  readonly activityRecordId: ObjectId;
  readonly weeklyScoreLedgerId: ObjectId;
  readonly requestedBy: ObjectId;
  readonly idempotencyKey: string;
  readonly requestedStatus: Exclude<ActivityStatus, "pending">;
  readonly requestedApprovedQuantity: number;
  readonly requiredPointsReversal: number;
  readonly balanceAtRequest: number;
  readonly status: "open" | "resolved" | "cancelled";
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: ObjectId | null;
  readonly resolutionNote: string | null;
}

export interface ActivitySubmissionPersistencePlan {
  readonly activity: ActivityRecord;
  readonly ledgerOnInsert: WeeklyScoreLedger;
  readonly ledgerUpsert: {
    readonly filter: Readonly<Record<string, unknown>>;
    readonly update: Readonly<Record<string, unknown>>;
    readonly options: { readonly upsert: true };
  };
  readonly auditEvent: ActivityAuditEvent;
}
