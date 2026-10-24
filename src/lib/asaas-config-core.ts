export type AsaasEnvironment = "sandbox" | "production";
export type AsaasProductionMutation =
  | "customer_creation"
  | "subscription_creation"
  | "subscription_changes"
  | "cancellation"
  | "reactivation";

export const ASAAS_BASE_URLS: Record<AsaasEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

const SWITCHES: Record<AsaasProductionMutation, string> = {
  customer_creation: "ENABLE_ASAAS_PRODUCTION_CUSTOMER_CREATION",
  subscription_creation: "ENABLE_ASAAS_PRODUCTION_SUBSCRIPTION_CREATION",
  subscription_changes: "ENABLE_ASAAS_PRODUCTION_SUBSCRIPTION_CHANGES",
  cancellation: "ENABLE_ASAAS_PRODUCTION_CANCELLATION",
  reactivation: "ENABLE_ASAAS_PRODUCTION_REACTIVATION",
};

export function parseAsaasEnvironment(value: unknown): AsaasEnvironment {
  if (value !== "sandbox" && value !== "production") throw new Error("ASAAS_ENV_INVALID");
  return value;
}

export function isAsaasProductionMutationAllowed(
  environment: AsaasEnvironment,
  operation: AsaasProductionMutation,
  env: NodeJS.ProcessEnv,
): boolean {
  if (environment === "sandbox") return true;
  return env.ENABLE_ASAAS_PRODUCTION_MUTATIONS === "true" && env[SWITCHES[operation]] === "true";
}
