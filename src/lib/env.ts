export type EnvironmentClassification = "SERVER_ONLY" | "PUBLIC_SAFE" | "SANDBOX_ONLY" | "PRODUCTION_REQUIRED" | "OPTIONAL";

export const ENVIRONMENT_VARIABLES: ReadonlyArray<{ name: string; classification: EnvironmentClassification }> = [
  { name: "MONGODB_URI", classification: "PRODUCTION_REQUIRED" },
  { name: "APP_URL", classification: "PUBLIC_SAFE" },
  { name: "RESEND_API_KEY", classification: "SERVER_ONLY" },
  { name: "RESEND_FROM_EMAIL", classification: "PRODUCTION_REQUIRED" },
  { name: "ASAAS_ENV", classification: "SERVER_ONLY" },
  { name: "ASAAS_API_KEY", classification: "SERVER_ONLY" },
  { name: "ASAAS_WEBHOOK_TOKEN", classification: "SERVER_ONLY" },
  { name: "ENABLE_ADMIN_SETUP", classification: "SANDBOX_ONLY" },
  { name: "ENABLE_LEGACY_STUDENT_REGISTRATION", classification: "SANDBOX_ONLY" },
  { name: "ENABLE_SANDBOX_RECOVERY_CAPTURE", classification: "SANDBOX_ONLY" },
] as const;

const OFFICIAL_APP_URL = "https://superpontos.gfars.com.br";

export type ConfigurationStatus = {
  databaseConfigured: boolean;
  appUrlConfigured: boolean;
  appUrlOfficial: boolean;
  email: { configured: boolean; provider: "Resend"; senderConfigured: boolean };
  environment: "production" | "development" | "test";
  asaasMode: "sandbox" | "invalid_or_unset";
  productionBillingEnabled: false;
  legalReview: "pending";
  backupVerification: "unknown";
};

export function getProductionConfigurationStatus(env: NodeJS.ProcessEnv = process.env): ConfigurationStatus {
  let appUrlOfficial = false;
  try { appUrlOfficial = new URL(env.APP_URL ?? "").origin === OFFICIAL_APP_URL; } catch { appUrlOfficial = false; }
  const senderConfigured = Boolean(env.RESEND_FROM_EMAIL?.trim());
  return {
    databaseConfigured: Boolean(env.MONGODB_URI?.trim()),
    appUrlConfigured: Boolean(env.APP_URL?.trim()),
    appUrlOfficial,
    email: { configured: Boolean(env.RESEND_API_KEY?.trim()) && senderConfigured, provider: "Resend", senderConfigured },
    environment: env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development",
    asaasMode: env.ASAAS_ENV === "sandbox" ? "sandbox" : "invalid_or_unset",
    productionBillingEnabled: false,
    legalReview: "pending",
    backupVerification: "unknown",
  };
}

export function requireServerEnvironment(name: "MONGODB_URI" | "APP_URL", env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
