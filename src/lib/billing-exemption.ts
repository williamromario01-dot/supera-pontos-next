import type { Document } from "mongodb";

export type BillingExemptionType = "period" | "months" | "indefinite";
export type BillingExemptionStatus =
  | "active"
  | "scheduled"
  | "pending_provider_action"
  | "ended";

export type BillingExemption = {
  status: BillingExemptionStatus;
  type: BillingExemptionType;
  startsAt: Date;
  endsAt: Date | null;
  months: number | null;
  reason: string;
  grantedBy: unknown;
  grantedAt: Date;
  updatedAt: Date;
  endedAt?: Date | null;
  endedBy?: unknown;
  endReason?: string | null;
  providerAction?: {
    required: boolean;
    reason: "active_subscription" | "pending_payment" | null;
    pendingPaymentDetected: boolean;
    remoteSubscriptionDetected: boolean;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const ALLOWED_EXEMPTION_MONTHS = [1, 2, 3, 6, 12] as const;

function validDate(value: unknown): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

export function parseDateOnly(value: unknown, endOfDay = false): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

export function calculateMonthsEnd(startsAt: Date, months: number): Date {
  const targetMonth = startsAt.getUTCMonth() + months;
  const firstOfTarget = new Date(Date.UTC(startsAt.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(
    firstOfTarget.getUTCFullYear(),
    firstOfTarget.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  const anniversary = new Date(Date.UTC(
    firstOfTarget.getUTCFullYear(),
    firstOfTarget.getUTCMonth(),
    Math.min(startsAt.getUTCDate(), lastDay),
  ));
  return new Date(anniversary.getTime() - 1);
}

export function normalizeBillingExemption(value: unknown): BillingExemption | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const startsAt = validDate(item.startsAt);
  const endsAt = item.endsAt === null ? null : validDate(item.endsAt);
  if (
    !startsAt ||
    !["period", "months", "indefinite"].includes(String(item.type)) ||
    !["active", "scheduled", "pending_provider_action", "ended"].includes(String(item.status))
  ) return null;
  return {
    ...(item as BillingExemption),
    startsAt,
    endsAt,
  };
}

export function isBillingExemptionActive(
  value: unknown,
  now = new Date(),
): boolean {
  const exemption = normalizeBillingExemption(value);
  if (!exemption || exemption.status === "ended" || exemption.status === "pending_provider_action") {
    return false;
  }
  return now >= exemption.startsAt && (!exemption.endsAt || now <= exemption.endsAt);
}

export function isBillingExemptionExpired(
  value: unknown,
  now = new Date(),
): boolean {
  const exemption = normalizeBillingExemption(value);
  return Boolean(
    exemption &&
    exemption.status !== "ended" &&
    exemption.status !== "pending_provider_action" &&
    exemption.endsAt &&
    now > exemption.endsAt,
  );
}

export function exemptionProviderAction(
  subscription: Document,
): NonNullable<BillingExemption["providerAction"]> {
  const remoteSubscriptionDetected =
    typeof subscription.providerSubscriptionId === "string" ||
    typeof subscription.provider?.subscriptionId === "string";
  const pendingPaymentDetected =
    typeof subscription.providerPaymentId === "string" ||
    ["pending_payment", "preparing", "reconciliation_required"].includes(
      String(subscription.quantityChange?.status ?? ""),
    ) ||
    ["pending_payment", "preparing", "reconciliation_required"].includes(
      String(subscription.reactivation?.status ?? ""),
    );
  return {
    required: remoteSubscriptionDetected || pendingPaymentDetected,
    reason: pendingPaymentDetected
      ? "pending_payment"
      : remoteSubscriptionDetected
        ? "active_subscription"
        : null,
    pendingPaymentDetected,
    remoteSubscriptionDetected,
  };
}

export function daysUntilExemptionEnd(value: unknown, now = new Date()): number | null {
  const exemption = normalizeBillingExemption(value);
  return exemption?.endsAt
    ? Math.max(0, Math.ceil((exemption.endsAt.getTime() - now.getTime()) / DAY_MS))
    : null;
}
