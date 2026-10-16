export const OPEN_QUANTITY_CHANGE_STATUSES = [
  "preparing",
  "reconciliation_required",
  "pending_payment",
  "overdue",
  "capacity_conflict",
] as const;

export type QuantityChangeStatus =
  | typeof OPEN_QUANTITY_CHANGE_STATUSES[number]
  | "completed"
  | "refunded"
  | "failed";

export interface QuantityChangeRecord {
  type: "upgrade" | "downgrade";
  status: QuantityChangeStatus;
  fromUnits: number;
  toUnits: number;
  previousMonthlyValueCents: number;
  targetMonthlyValueCents: number;
  providerPaymentId?: string;
  providerSubscriptionId: string;
  providerCustomerId: string;
}

export interface QuantityChangePayment {
  id: string;
  subscription?: string;
  customer?: string;
  value?: number;
}

export function parseQuantityChangeRequest(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    !("requestedUnits" in record) ||
    typeof record.requestedUnits !== "number" ||
    !Number.isSafeInteger(record.requestedUnits)
  ) return null;
  return record.requestedUnits;
}

export function isOpenQuantityChange(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" &&
    (OPEN_QUANTITY_CHANGE_STATUSES as readonly string[]).includes(status);
}

export function matchesQuantityChangePayment(
  change: unknown,
  payment: QuantityChangePayment,
): change is QuantityChangeRecord {
  if (!change || typeof change !== "object") return false;
  const item = change as Record<string, unknown>;
  if (
    (item.type !== "upgrade" && item.type !== "downgrade") ||
    !["pending_payment", "overdue", "completed", "refunded"].includes(String(item.status)) ||
    !Number.isSafeInteger(item.fromUnits) ||
    !Number.isSafeInteger(item.toUnits) ||
    (item.toUnits as number) === (item.fromUnits as number) ||
    !Number.isSafeInteger(item.targetMonthlyValueCents) ||
    (item.targetMonthlyValueCents as number) <= 0 ||
    typeof item.providerPaymentId !== "string" ||
    typeof item.providerSubscriptionId !== "string" ||
    typeof item.providerCustomerId !== "string"
  ) return false;
  const directionIsValid = item.type === "upgrade"
    ? (item.toUnits as number) > (item.fromUnits as number)
    : (item.toUnits as number) < (item.fromUnits as number);
  return directionIsValid && payment.id === item.providerPaymentId &&
    payment.subscription === item.providerSubscriptionId &&
    payment.customer === item.providerCustomerId &&
    typeof payment.value === "number" && Number.isFinite(payment.value) &&
    Math.round(payment.value * 100) === item.targetMonthlyValueCents;
}

export function canCompleteQuantityChange(change: QuantityChangeRecord): boolean {
  return change.status === "pending_payment" || change.status === "overdue";
}

export function hasCapacityForQuantityChange(
  change: QuantityChangeRecord,
  activeUnits: number,
): boolean {
  return Number.isSafeInteger(activeUnits) && activeUnits >= 0 &&
    (change.type !== "downgrade" || activeUnits <= change.toUnits);
}
