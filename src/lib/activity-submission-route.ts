import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import type { AuthenticatedUser } from "./auth.ts";
import { getSchoolObjectId } from "./auth.ts";
import {
  ActivityApprovalAuthorizationError,
  ActivityApprovalClosedWeekError,
  ActivityApprovalDisabledError,
  ActivityApprovalNotFoundError,
} from "./activity-approval-service.ts";
import {
  ActivitySubmissionAuthorizationError,
  ActivitySubmissionClosedWeekError,
  ActivitySubmissionNotFoundError,
  ActivitySubmissionModeError,
} from "./activity-submission-service.ts";
import {
  ActivityPersistenceConflictError,
  ActivityPersistenceScopeError,
  ActivityPersistenceValidationError,
} from "./activity-persistence.ts";

export function activitySubmissionsDisabledResponse() {
  return NextResponse.json({ error: "Recurso não disponível." }, { status: 404 });
}

export function resolveActivitySchool(auth: AuthenticatedUser, requested: unknown): ObjectId | null {
  if (auth.role === "super_admin") return getSchoolObjectId(requested);
  return auth.schoolId;
}

export function serializeActivity(row: object) {
  const value = row as Record<string, unknown>;
  return {
    id: String(value._id),
    schoolId: String(value.schoolId), studentId: String(value.studentId), categoryId: String(value.categoryId),
    activityAt: value.activityAt, weekStart: value.weekStart, weekEnd: value.weekEnd,
    reportedQuantity: value.reportedQuantity, approvedQuantity: value.approvedQuantity,
    pageReached: value.pageReached, book: value.book, status: value.status,
    source: value.source ?? "student_submission", observation: value.observation ?? null,
    reviewedByEducatorId: value.reviewedByEducatorId ? String(value.reviewedByEducatorId) : null,
    reviewedAt: value.reviewedAt, revision: value.revision, createdAt: value.createdAt, updatedAt: value.updatedAt,
  };
}

export function activityRouteError(error: unknown) {
  if (error instanceof ActivityPersistenceValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof ActivitySubmissionAuthorizationError || error instanceof ActivityPersistenceScopeError) return NextResponse.json({ error: "Operação não autorizada." }, { status: 403 });
  if (error instanceof ActivitySubmissionNotFoundError) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  if (error instanceof ActivitySubmissionClosedWeekError || error instanceof ActivityPersistenceConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof ActivitySubmissionModeError) return NextResponse.json({ error: "A escola utiliza o modo tradicional de pontuaÃ§Ã£o." }, { status: 409 });
  if (error instanceof ActivityApprovalAuthorizationError) return NextResponse.json({ error: "OperaÃ§Ã£o nÃ£o autorizada." }, { status: 403 });
  if (error instanceof ActivityApprovalNotFoundError) return NextResponse.json({ error: "Registro nÃ£o encontrado." }, { status: 404 });
  if (error instanceof ActivityApprovalClosedWeekError || error instanceof ActivityApprovalDisabledError) return NextResponse.json({ error: error.message }, { status: 409 });
  console.error("Activity submission error", error);
  return NextResponse.json({ error: "Não foi possível processar a atividade." }, { status: 500 });
}
