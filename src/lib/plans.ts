import type { BillingInterval } from "@/lib/types";

export const PRICING_MODEL_CODE = "quantity_monthly_v1";
export const BILLING_INTERVAL: BillingInterval = "monthly";
export const MAX_CONTRACTED_UNITS = 10_000;
export const INDIVIDUAL_UNIT_PRICE_CENTS = 11_990;

export const UNIT_PRICE_TIERS = [
  { minUnits: 1, maxUnits: 1, pricePerUnitCents: 11_990 },
  { minUnits: 2, maxUnits: 2, pricePerUnitCents: 11_590 },
  { minUnits: 3, maxUnits: 3, pricePerUnitCents: 11_390 },
  { minUnits: 4, maxUnits: 4, pricePerUnitCents: 11_190 },
  { minUnits: 5, maxUnits: 5, pricePerUnitCents: 10_990 },
  { minUnits: 6, maxUnits: 6, pricePerUnitCents: 10_790 },
  { minUnits: 7, maxUnits: 7, pricePerUnitCents: 10_590 },
  { minUnits: 8, maxUnits: 8, pricePerUnitCents: 10_390 },
  { minUnits: 9, maxUnits: 9, pricePerUnitCents: 10_190 },
  { minUnits: 10, maxUnits: null, pricePerUnitCents: 9_990 },
] as const;

export interface PricingQuote {
  requestedUnits: number;
  pricePerUnitCents: number;
  totalMonthlyCents: number;
  individualTotalMonthlyCents: number;
  economyMonthlyCents: number;
  billingInterval: BillingInterval;
  pricingModel: typeof PRICING_MODEL_CODE;
}

export function parseRequestedUnits(value: unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAX_CONTRACTED_UNITS
    ? value
    : null;
}

export function pricePerUnitCents(requestedUnits: number): number {
  const units = parseRequestedUnits(requestedUnits);
  if (units === null) throw new RangeError("INVALID_REQUESTED_UNITS");
  return UNIT_PRICE_TIERS.find((tier) => tier.maxUnits === null || units <= tier.maxUnits)!.pricePerUnitCents;
}

export function totalMonthlyCents(requestedUnits: number): number {
  return requestedUnits * pricePerUnitCents(requestedUnits);
}

export function economyVsIndividualCents(requestedUnits: number): number {
  return requestedUnits * INDIVIDUAL_UNIT_PRICE_CENTS - totalMonthlyCents(requestedUnits);
}

export function getPricingQuote(value: unknown): PricingQuote | null {
  const requestedUnits = parseRequestedUnits(value);
  if (requestedUnits === null) return null;
  const unitPrice = pricePerUnitCents(requestedUnits);
  const total = requestedUnits * unitPrice;
  const individualTotal = requestedUnits * INDIVIDUAL_UNIT_PRICE_CENTS;
  return {
    requestedUnits,
    pricePerUnitCents: unitPrice,
    totalMonthlyCents: total,
    individualTotalMonthlyCents: individualTotal,
    economyMonthlyCents: individualTotal - total,
    billingInterval: BILLING_INTERVAL,
    pricingModel: PRICING_MODEL_CODE,
  };
}

export function getQuantityChangeQuote(currentUnits: number, requestedUnits: number, existingUnits = 0) {
  const current = getPricingQuote(currentUnits);
  const requested = getPricingQuote(requestedUnits);
  if (!requested || !Number.isSafeInteger(existingUnits) || existingUnits < 0 || requestedUnits < existingUnits) return null;
  return {
    ...requested,
    name: quantityLabel(requested.requestedUnits),
    changeType: requestedUnits > currentUnits ? "upgrade" : requestedUnits < currentUnits ? "downgrade" : "unchanged",
    currentTotalMonthlyCents: current?.totalMonthlyCents ?? 0,
    nominalMonthlyDifferenceCents: requested.totalMonthlyCents - (current?.totalMonthlyCents ?? 0),
  };
}

export function getUpgradeQuote(currentUnits: number, requestedUnits: number) {
  if (requestedUnits <= currentUnits) return null;
  return getQuantityChangeQuote(currentUnits, requestedUnits);
}

export function quantityLabel(units: number): string {
  return `${units} ${units === 1 ? "unidade" : "unidades"}`;
}

export function formatCurrencyCents(cents: number): string {
  const absolute = Math.abs(cents);
  const reais = Math.floor(absolute / 100).toLocaleString("pt-BR");
  const centavos = String(absolute % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}R$ ${reais},${centavos}`;
}
