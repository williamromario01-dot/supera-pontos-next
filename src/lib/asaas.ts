import "server-only";

export type AsaasEnvironment = "sandbox";

const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";

export interface AsaasConfig {
  environment: AsaasEnvironment;
  baseUrl: string;
  apiKey: string;
}

function getSandboxEnvironment(): AsaasEnvironment {
  const environment = process.env.ASAAS_ENV?.trim();

  if (environment !== "sandbox") {
    throw new Error("ASAAS_ENV_INVALID_OR_PRODUCTION_NOT_ENABLED");
  }

  return environment;
}

export function getAsaasBaseUrl(): string {
  getSandboxEnvironment();
  return ASAAS_SANDBOX_URL;
}

export function getAsaasConfig(): AsaasConfig {
  const environment = getSandboxEnvironment();
  const apiKey = process.env.ASAAS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ASAAS_API_KEY_NOT_CONFIGURED");
  }

  return {
    environment,
    baseUrl: ASAAS_SANDBOX_URL,
    apiKey,
  };
}
