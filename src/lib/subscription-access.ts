import { ObjectId, type Db, type Document } from "mongodb";
import type { UserRole } from "@/lib/types";
import { getCancellationAccessState } from "./subscription-cancellation.ts";

export const PAST_DUE_GRACE_PERIOD_MS = 5 * 24 * 60 * 60 * 1000;
export type SubscriptionAccessState = {
  state: "active" | "grace_period" | "blocked" | "cancellation_scheduled" | "cancelled";
  pastDueAt: Date | null;
  gracePeriodEndsAt: Date | null;
  daysPastDue: number;
  cancellationEffectiveAt: Date | null;
  canPerformOperationalMutation: boolean;
};

function validDate(value: unknown): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

export function getSubscriptionAccessState(
  subscription: Document | null,
  now = new Date(),
): SubscriptionAccessState {
  const cancellation = getCancellationAccessState(subscription, now);
  if (cancellation.state === "cancelled") {
    return {
      state: "cancelled",
      pastDueAt: null,
      gracePeriodEndsAt: null,
      daysPastDue: 0,
      cancellationEffectiveAt: cancellation.effectiveAt,
      canPerformOperationalMutation: false,
    };
  }
  if (!subscription || subscription.status !== "past_due") {
    return {
      state: cancellation.state === "cancellation_scheduled"
        ? "cancellation_scheduled"
        : "active",
      pastDueAt: null,
      gracePeriodEndsAt: null,
      daysPastDue: 0,
      cancellationEffectiveAt: cancellation.effectiveAt,
      canPerformOperationalMutation: true,
    };
  }
  const pastDueAt = validDate(subscription.pastDueAt) ??
    validDate(subscription.providerPaymentUpdatedAt) ??
    validDate(subscription.updatedAt) ??
    now;
  const gracePeriodEndsAt = validDate(subscription.gracePeriodEndsAt)
    ? subscription.gracePeriodEndsAt
    : new Date(pastDueAt.getTime() + PAST_DUE_GRACE_PERIOD_MS);
  const blocked = now.getTime() > gracePeriodEndsAt.getTime();
  return {
    state: blocked ? "blocked" : "grace_period",
    pastDueAt,
    gracePeriodEndsAt,
    daysPastDue: Math.max(0, Math.floor((now.getTime() - pastDueAt.getTime()) / (24 * 60 * 60 * 1000))),
    cancellationEffectiveAt: cancellation.effectiveAt,
    canPerformOperationalMutation: !blocked,
  };
}

type OperationalUser = Document & {
  role?: UserRole | string;
  companyId?: ObjectId | string | null;
  schoolId?: ObjectId | string | null;
};

function objectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) return value;
  return typeof value === "string" && ObjectId.isValid(value)
    ? new ObjectId(value)
    : null;
}

async function companyIdForAuth(db: Db, auth: OperationalUser): Promise<ObjectId | null> {
  if (auth.role === "super_admin") return null;
  const directCompanyId = objectId(auth.companyId);
  if (directCompanyId) return directCompanyId;
  if (!auth.schoolId) return null;
  const schoolId = objectId(auth.schoolId);
  if (!schoolId) return null;
  const school = await db.collection("schools").findOne(
    { _id: schoolId },
    { projection: { companyId: 1 } },
  );
  return objectId(school?.companyId);
}

export async function getOperationalAccessForAuth(
  db: Db,
  auth: OperationalUser,
  now = new Date(),
): Promise<SubscriptionAccessState> {
  const companyId = await companyIdForAuth(db, auth);
  if (!companyId) return getSubscriptionAccessState(null, now);
  const subscription = await db.collection("subscriptions").findOne(
    { companyId },
    { sort: { createdAt: -1 } },
  );
  return getSubscriptionAccessState(subscription, now);
}

export const subscriptionPastDueResponse = {
  error: "A assinatura da empresa está em atraso. Regularize o pagamento para continuar utilizando as funções operacionais.",
  code: "SUBSCRIPTION_PAST_DUE",
};

export const subscriptionCancelledResponse = {
  error: "Sua assinatura foi encerrada. Reative seu plano para voltar a utilizar as funções operacionais.",
  code: "SUBSCRIPTION_CANCELLED",
};

export function subscriptionPastDueResponseForAccess(access: SubscriptionAccessState) {
  return access.state === "cancelled"
    ? subscriptionCancelledResponse
    : subscriptionPastDueResponse;
}
