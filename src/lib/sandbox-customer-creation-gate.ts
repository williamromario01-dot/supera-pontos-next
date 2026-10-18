type CustomerCreationScope = { companyId: string; externalReference: string; subscriptionId: string };
export function isSandboxCustomerCreationAllowed(scope: CustomerCreationScope, env: NodeJS.ProcessEnv = process.env, now = new Date()): boolean {
  if (env.NODE_ENV === "production" || env.ASAAS_ENV !== "sandbox" || env.ENABLE_SANDBOX_CUSTOMER_CREATION !== "true") return false;
  const expiresAt = env.SANDBOX_CUSTOMER_CREATION_EXPIRES_AT ? new Date(env.SANDBOX_CUSTOMER_CREATION_EXPIRES_AT) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return false;
  return env.SANDBOX_CUSTOMER_CREATION_COMPANY_ID === scope.companyId
    && env.SANDBOX_CUSTOMER_CREATION_EXTERNAL_REFERENCE === scope.externalReference
    && env.SANDBOX_CUSTOMER_CREATION_SUBSCRIPTION_ID === scope.subscriptionId;
}