import type { BillingInterval } from "@/lib/types";

export interface PlanDefinition {
  code: string;
  name: string;
  maxUnits: number;
  price: number | null;
  active: boolean;
  billingInterval: BillingInterval;
}

// Preços permanecem nulos até a definição comercial e integração do provedor.
export const PLAN_CATALOG: readonly PlanDefinition[] = [
  { code: "units_1_monthly", name: "1 unidade", maxUnits: 1, price: null, active: true, billingInterval: "monthly" },
  { code: "units_2_monthly", name: "2 unidades", maxUnits: 2, price: null, active: true, billingInterval: "monthly" },
  { code: "units_3_monthly", name: "3 unidades", maxUnits: 3, price: null, active: true, billingInterval: "monthly" },
  { code: "units_5_monthly", name: "Até 5 unidades", maxUnits: 5, price: null, active: true, billingInterval: "monthly" },
  { code: "units_10_monthly", name: "Até 10 unidades", maxUnits: 10, price: null, active: true, billingInterval: "monthly" },
] as const;

export function getPlan(code: unknown) {
  return PLAN_CATALOG.find((plan) => plan.code === code && plan.active) ?? null;
}

export function getNextPlan(currentMaxUnits: number, requestedUnits: number) {
  return [...PLAN_CATALOG]
    .filter((plan) => plan.active && plan.maxUnits >= requestedUnits && plan.maxUnits > currentMaxUnits)
    .sort((a, b) => a.maxUnits - b.maxUnits)[0] ?? null;
}
