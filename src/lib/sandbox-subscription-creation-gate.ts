type SubscriptionCreationScope = { companyId: string; subscriptionId: string; providerCustomerId: string; externalReference: string; requestedMaxUnits: number; valueCents: number };
export function isSandboxSubscriptionCreationAllowed(scope: SubscriptionCreationScope, env: NodeJS.ProcessEnv = process.env, now = new Date()): boolean {
  if (env.NODE_ENV === "production" || env.ASAAS_ENV !== "sandbox" || env.ENABLE_SANDBOX_SUBSCRIPTION_CREATION !== "true") return false;
  const expiresAt = env.SANDBOX_SUBSCRIPTION_CREATION_EXPIRES_AT ? new Date(env.SANDBOX_SUBSCRIPTION_CREATION_EXPIRES_AT) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return false;
  return env.SANDBOX_SUBSCRIPTION_CREATION_COMPANY_ID === scope.companyId && env.SANDBOX_SUBSCRIPTION_CREATION_SUBSCRIPTION_ID === scope.subscriptionId && env.SANDBOX_SUBSCRIPTION_CREATION_CUSTOMER_ID === scope.providerCustomerId && env.SANDBOX_SUBSCRIPTION_CREATION_EXTERNAL_REFERENCE === scope.externalReference && env.SANDBOX_SUBSCRIPTION_CREATION_REQUESTED_MAX_UNITS === String(scope.requestedMaxUnits) && env.SANDBOX_SUBSCRIPTION_CREATION_VALUE_CENTS === String(scope.valueCents);
}
