export const CANCELLATION_REASON_CODES = [
  "price",
  "not_using",
  "difficulty",
  "missing_features",
  "business_change",
  "other",
] as const;

export type CancellationReasonCode = typeof CANCELLATION_REASON_CODES[number];

export type CancellationRequest = {
  reason?: CancellationReasonCode;
  comment?: string;
};

type CancellationSubscription = {
  cancelAtPeriodEnd?: unknown;
  [key: string]: unknown;
  cancellationEffectiveAt?: unknown;
};

type RemoteSubscription = {
  id: string;
  customer: string;
  status?: string;
  cycle: string;
  billingType: string;
  nextDueDate: string;
  endDate?: string | null;
};

type RemotePayment = {
  id: string;
  customer?: string;
  subscription?: string;
  status: string;
  dueDate: string;
};

export type CancellationDates = {
  effectiveAt: Date;
  effectiveDate: string;
  providerEndDate: string;
};

function validDate(value: unknown): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function addUtcMonth(value: string): string {
  const source = new Date(`${value}T00:00:00.000Z`);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 2, 0));
  target.setUTCDate(Math.min(day, target.getUTCDate()));
  return target.toISOString().slice(0, 10);
}

function previousUtcDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function parseCancellationRequest(value: unknown): CancellationRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "reason" && key !== "comment")) {
    return null;
  }
  if (
    record.reason !== undefined &&
    (typeof record.reason !== "string" ||
      !(CANCELLATION_REASON_CODES as readonly string[]).includes(record.reason))
  ) return null;
  if (record.comment !== undefined && typeof record.comment !== "string") return null;
  const comment = typeof record.comment === "string"
    ? record.comment
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    : "";
  if (comment.length > 500) return null;
  return {
    ...(record.reason ? { reason: record.reason as CancellationReasonCode } : {}),
    ...(comment ? { comment } : {}),
  };
}

export function getCancellationAccessState(
  subscription: CancellationSubscription | null,
  now = new Date(),
): {
  state: "none" | "cancellation_scheduled" | "cancelled";
  effectiveAt: Date | null;
  canPerformOperationalMutation: boolean;
} {
  if (!subscription || subscription.cancelAtPeriodEnd !== true) {
    return { state: "none", effectiveAt: null, canPerformOperationalMutation: true };
  }
  const effectiveAt = validDate(subscription.cancellationEffectiveAt);
  if (!effectiveAt) {
    return { state: "cancelled", effectiveAt: null, canPerformOperationalMutation: false };
  }
  const cancelled = now.getTime() >= effectiveAt.getTime();
  return {
    state: cancelled ? "cancelled" : "cancellation_scheduled",
    effectiveAt,
    canPerformOperationalMutation: !cancelled,
  };
}

export function deriveCancellationDates(
  remote: RemoteSubscription,
  payments: RemotePayment[],
  now = new Date(),
): CancellationDates | null {
  if (
    remote.status !== "ACTIVE" ||
    remote.cycle !== "MONTHLY" ||
    (remote.billingType !== "PIX" && remote.billingType !== "BOLETO")
  ) return null;
  const nextDueDate = dateOnly(remote.nextDueDate);
  if (!nextDueDate) return null;
  if (payments.some((payment) =>
    payment.subscription !== remote.id ||
    payment.customer !== remote.customer ||
    payment.status === "PENDING" ||
    payment.status === "OVERDUE"
  )) return null;
  const settledDates = payments
    .filter((payment) =>
      payment.status === "RECEIVED" || payment.status === "CONFIRMED"
    )
    .map((payment) => dateOnly(payment.dueDate))
    .filter((value): value is string => value !== null)
    .sort();
  const latestSettledDueDate = settledDates.at(-1);
  if (!latestSettledDueDate || addUtcMonth(latestSettledDueDate) !== nextDueDate) {
    return null;
  }
  const effectiveAt = new Date(`${nextDueDate}T00:00:00.000Z`);
  if (effectiveAt.getTime() <= now.getTime()) return null;
  return {
    effectiveAt,
    effectiveDate: nextDueDate,
    providerEndDate: previousUtcDate(nextDueDate),
  };
}
