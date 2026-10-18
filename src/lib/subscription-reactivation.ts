import { getPricingQuote } from "./plans.ts";

export const OPEN_REACTIVATION_STATUSES = [
  "preparing",
  "pending_payment",
  "reconciliation_required",
] as const;

export type ReactivationRequest = { requestedUnits: number };

export function parseReactivationRequest(value: unknown): ReactivationRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "requestedUnits")) return null;
  const quote = getPricingQuote(record.requestedUnits);
  return quote ? { requestedUnits: quote.requestedUnits } : null;
}

export function isOpenReactivation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" &&
    (OPEN_REACTIVATION_STATUSES as readonly string[]).includes(status);
}

export function nextReactivationDueDate(now = new Date()): string {
  const date = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ));
  return date.toISOString().slice(0, 10);
}

type PaymentIdentity = {
  id?: unknown;
  customer?: unknown;
  subscription?: unknown;
  status?: unknown;
  value?: unknown;
};

export function matchesReactivationPayment(
  reactivation: unknown,
  payment: PaymentIdentity,
): boolean {
  if (!reactivation || typeof reactivation !== "object") return false;
  const item = reactivation as Record<string, unknown>;
  return item.status === "pending_payment" &&
    payment.id === item.providerPaymentId &&
    payment.customer === item.providerCustomerId &&
    payment.subscription === item.providerSubscriptionId &&
    typeof payment.value === "number" &&
    Math.round(payment.value * 100) === item.targetMonthlyValueCents;
}
