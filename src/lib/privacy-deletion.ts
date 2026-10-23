export const COMPANY_DATA_INVENTORY = [
  { collection: "companies", relation: "_id", action: "retain_for_legal_review" },
  { collection: "users", relation: "companyId", action: "anonymize_or_delete" },
  { collection: "sessions", relation: "userId via users", action: "delete" },
  { collection: "schools", relation: "companyId", action: "anonymize_or_delete" },
  { collection: "classes", relation: "schoolId via schools", action: "anonymize_or_delete" },
  { collection: "categories", relation: "companyId or schoolId", action: "anonymize_or_delete" },
  { collection: "pointEvents", relation: "companyId, schoolId or studentId", action: "anonymize_or_delete" },
  { collection: "referrals", relation: "companyId, schoolId or studentId", action: "anonymize_or_delete" },
  { collection: "productsSupera", relation: "companyId or schoolId", action: "anonymize_or_delete" },
  { collection: "privacyRequests", relation: "companyId", action: "retain_for_legal_review" },
  { collection: "legalAcceptances", relation: "companyId", action: "retain_for_legal_review" },
  { collection: "subscriptions", relation: "companyId", action: "retain_for_legal_review" },
  { collection: "billingEvents", relation: "companyId", action: "retain_for_legal_review" },
] as const;

export function buildCompanyDeletionDryRun(companyId: string) {
  if (!/^[a-f\d]{24}$/i.test(companyId)) throw new Error("INVALID_COMPANY_ID");
  return {
    companyId,
    mode: "DRY_RUN" as const,
    executionAllowed: false,
    requiresExplicitFutureAuthorization: true,
    inventory: COMPANY_DATA_INVENTORY,
    warning: "Nenhum dado é alterado por este plano. Retenções legais e financeiras exigem validação antes de qualquer execução.",
  };
}
