import "server-only";

import type { AsaasEnvironment } from "@/lib/asaas";
import { isAsaasProductionMutationAllowed, type AsaasProductionMutation } from "@/lib/asaas-config-core";
export type { AsaasProductionMutation } from "@/lib/asaas-config-core";

export function isAsaasMutationAllowed(
  environment: AsaasEnvironment,
  operation: AsaasProductionMutation,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isAsaasProductionMutationAllowed(environment, operation, env);
}

export function assertAsaasMutationAllowed(
  environment: AsaasEnvironment,
  operation: AsaasProductionMutation,
): void {
  if (!isAsaasMutationAllowed(environment, operation)) {
    throw new Error("ASAAS_PRODUCTION_MUTATION_BLOCKED");
  }
}
