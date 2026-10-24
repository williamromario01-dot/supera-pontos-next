import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ASAAS_BASE_URLS,
  isAsaasProductionMutationAllowed,
  parseAsaasEnvironment,
} from "../src/lib/asaas-config-core.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Asaas environment is strict and maps only fixed URLs", () => {
  assert.equal(parseAsaasEnvironment("sandbox"), "sandbox");
  assert.equal(parseAsaasEnvironment("production"), "production");
  assert.equal(ASAAS_BASE_URLS.sandbox, "https://api-sandbox.asaas.com/v3");
  assert.equal(ASAAS_BASE_URLS.production, "https://api.asaas.com/v3");
  assert.throws(() => parseAsaasEnvironment(undefined), /ASAAS_ENV_INVALID/);
  assert.throws(() => parseAsaasEnvironment("staging"), /ASAAS_ENV_INVALID/);
});

test("production mutation switches are fail closed and global switch prevails", () => {
  assert.equal(isAsaasProductionMutationAllowed("production", "customer_creation", {}), false);
  assert.equal(isAsaasProductionMutationAllowed("production", "customer_creation", { ENABLE_ASAAS_PRODUCTION_MUTATIONS: "false", ENABLE_ASAAS_PRODUCTION_CUSTOMER_CREATION: "true" }), false);
  assert.equal(isAsaasProductionMutationAllowed("production", "customer_creation", { ENABLE_ASAAS_PRODUCTION_MUTATIONS: "true", ENABLE_ASAAS_PRODUCTION_CUSTOMER_CREATION: "false" }), false);
  assert.equal(isAsaasProductionMutationAllowed("production", "customer_creation", { ENABLE_ASAAS_PRODUCTION_MUTATIONS: "true", ENABLE_ASAAS_PRODUCTION_CUSTOMER_CREATION: "true" }), true);
  assert.equal(isAsaasProductionMutationAllowed("sandbox", "customer_creation", {}), true);
});

test("provider links isolate environments and legacy fallback is Sandbox-only", async () => {
  const source = await read("src/lib/billing-provider-links.ts");
  assert.match(source, /environment !== "sandbox"/);
  assert.match(source, /uniq_provider_environment_subscription/);
  assert.match(source, /uniq_provider_environment_remote_subscription/);
  assert.match(source, /Compatibility is intentionally one-way/);
  assert.doesNotMatch(source, /environment === "production"[\s\S]{0,100}subscription\.providerCustomerId/);
});

test("webhook is environment scoped and stale overdue cannot regress settlement", async () => {
  const [route, events] = await Promise.all([
    read("src/app/api/webhooks/asaas/route.ts"),
    read("src/lib/billing-events.ts"),
  ]);
  assert.match(route, /ASAAS_SANDBOX_WEBHOOK_TOKEN/);
  assert.match(route, /ASAAS_PRODUCTION_WEBHOOK_TOKEN/);
  assert.match(events, /providerEnvironment/);
  assert.match(events, /uniq_provider_environment_event/);
  assert.match(events, /staleOverdue/);
  assert.match(events, /PAYMENT_REFUNDED/);
});

test("quantity lock independently excludes cancellation and reactivation", async () => {
  const source = await read("src/app/api/company/billing/quantity/route.ts");
  assert.match(source, /"cancellationOperation\.status": \{ \$nin:/);
  assert.match(source, /"reactivation\.status": \{ \$nin:/);
  assert.doesNotMatch(source, /"cancellationOperation\.status": \{\s*"reactivation\.status"/);
  assert.match(source, /DOWNGRADE_REQUIRES_UNIT_REDUCTION/);
  assert.match(source, /QUANTITY_CHANGE_IN_PROGRESS/);
});

test("subscription uncertain results reconcile before another create", async () => {
  const source = await read("src/app/api/company/billing/subscription/route.ts");
  assert.match(source, /providerSubscriptionCreateUncertainAt/);
  assert.match(source, /SUBSCRIPTION_CREATION_RECONCILIATION_PENDING/);
  assert.match(source, /findAsaasSubscriptions/);
  assert.match(source, /retainUncertainAttempt/);
});
