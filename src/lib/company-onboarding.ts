import type { Document } from "mongodb";
import { getPricingQuote } from "./plans.ts";

export type CompanyOnboardingState =
  | "company_created"
  | "plan_selected"
  | "awaiting_payment"
  | "payment_pending"
  | "active_no_school"
  | "school_created"
  | "setup_in_progress"
  | "completed";

export type CompanyOnboardingCounts = {
  activeSchools: number;
  admins: number;
  educators: number;
  students: number;
  classes: number;
  categories: number;
  pointEvents: number;
};

export function deriveCompanyOnboardingState(
  company: Document | null,
  subscription: Document | null,
  counts: CompanyOnboardingCounts,
): CompanyOnboardingState {
  if (!company) return "company_created";
  if (!subscription || !getPricingQuote(subscription.requestedMaxUnits)) {
    return "company_created";
  }
  if (subscription.status !== "active" || company.status !== "active") {
    if (typeof subscription.providerPaymentId === "string") return "payment_pending";
    if (typeof subscription.providerCustomerId === "string") return "awaiting_payment";
    return "plan_selected";
  }
  if (counts.activeSchools === 0) return "active_no_school";
  if (counts.admins === 0) return "school_created";
  if (counts.pointEvents > 0) return "completed";
  return "setup_in_progress";
}

export function onboardingStepForState(state: CompanyOnboardingState): number {
  switch (state) {
    case "company_created": return 1;
    case "plan_selected": return 2;
    case "awaiting_payment":
    case "payment_pending": return 3;
    case "active_no_school": return 4;
    case "school_created":
    case "setup_in_progress": return 5;
    case "completed": return 7;
  }
}
