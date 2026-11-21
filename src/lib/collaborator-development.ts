import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";

export const COLLABORATOR_COLLECTIONS = {
  classes: "collaboratorClasses",
  assignments: "collaboratorBookAssignments",
  activities: "collaboratorActivities",
  ledgers: "collaboratorWeeklyScoreLedgers",
  audits: "collaboratorActivityAudits",
  adjustmentPendencies: "collaboratorAdjustmentPendencies",
} as const;

export type CollaboratorRole = "educator" | "admin" | "company_admin" | "super_admin";
export type CollaboratorActivityStatus = "pending" | "approved" | "corrected" | "rejected";
export const ADMINISTRATIVE_SELF_APPROVAL_ROLES = ["admin", "company_admin", "super_admin"] as const;

export function canManageCollaboratorClass(role: string) {
  return ADMINISTRATIVE_SELF_APPROVAL_ROLES.includes(role as (typeof ADMINISTRATIVE_SELF_APPROVAL_ROLES)[number]);
}

export function canParticipateAsCollaborator(role: string): role is CollaboratorRole {
  return role === "educator" || canManageCollaboratorClass(role);
}

export function authorizeCollaboratorApproval(input: {
  actorId: ObjectId; actorRole: CollaboratorRole; participantId: ObjectId;
  participantRole: CollaboratorRole; isActiveParticipant: boolean; managesClass: boolean;
}) {
  if (!input.isActiveParticipant) throw new Error("PARTICIPATION_REQUIRED");
  const selfApproval = input.actorId.equals(input.participantId);
  if (selfApproval && !canManageCollaboratorClass(input.actorRole)) throw new Error("SELF_APPROVAL_FORBIDDEN");
  if (!selfApproval && !input.managesClass) throw new Error("MANAGER_REQUIRED");
  return { selfApprovalAdministrative: selfApproval };
}

export function deterministicCollaboratorId(scope: string, idempotencyKey: string) {
  return new ObjectId(createHash("sha256").update(`${scope}:${idempotencyKey.trim()}`).digest("hex").slice(0, 24));
}

export function collaboratorAudit(input: {
  activityId: ObjectId; actorId: ObjectId; participantId: ObjectId; schoolId: ObjectId; companyId: ObjectId;
  actorRole: CollaboratorRole; pointsGranted: number; occurredAt: Date; idempotencyKey: string; selfApprovalAdministrative: boolean;
}) {
  return {
    _id: deterministicCollaboratorId(String(input.schoolId), input.idempotencyKey),
    activityId: input.activityId, actorId: input.actorId, participantId: input.participantId,
    schoolId: input.schoolId, companyId: input.companyId, actorRole: input.actorRole,
    action: "approved" as const, pointsGranted: input.pointsGranted,
    selfApprovalAdministrative: input.selfApprovalAdministrative,
    occurredAt: input.occurredAt, idempotencyKey: input.idempotencyKey.trim(),
  };
}
