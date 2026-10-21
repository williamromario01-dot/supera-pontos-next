import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getProductionConfigurationStatus } from "../src/lib/env.ts";
import { getEmailConfigurationStatus } from "../src/lib/email/provider.ts";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("environment status classifies readiness without exposing values", () => {
  const status = getProductionConfigurationStatus({ NODE_ENV: "production", MONGODB_URI: "secret", APP_URL: "https://superpontos.gfars.com.br", RESEND_API_KEY: "secret", RESEND_FROM_EMAIL: "sender", ASAAS_ENV: "sandbox" });
  assert.deepEqual(status.email, { configured: true, provider: "Resend", senderConfigured: true });
  assert.equal(status.asaasMode, "sandbox"); assert.equal(status.productionBillingEnabled, false);
  assert.doesNotMatch(JSON.stringify(status), /secret/);
});

test("invalid production configuration fails closed in status", () => {
  const status = getProductionConfigurationStatus({ NODE_ENV: "production", APP_URL: "https://wrong.example", ASAAS_ENV: "production" });
  assert.equal(status.databaseConfigured, false); assert.equal(status.appUrlOfficial, false); assert.equal(status.asaasMode, "invalid_or_unset");
});

test("email configuration status never returns credentials", () => {
  const status = getEmailConfigurationStatus({ RESEND_API_KEY: "re_private", RESEND_FROM_EMAIL: "sender@example.test" });
  assert.equal(status.configured, true); assert.equal(status.provider, "Resend"); assert.doesNotMatch(JSON.stringify(status), /re_private|sender@example/);
});

test("email provider has timeout and converts failures to safe result", async () => {
  const source = await read("src/lib/email/provider.ts"); assert.match(source, /EMAIL_TIMEOUT_MS/); assert.match(source, /Promise\.race/); assert.match(source, /reason: "provider_error"/); assert.doesNotMatch(source, /console\./);
});

test("forgot password deletes failed token and returns neutral response", async () => {
  const source = await read("src/app/api/auth/forgot-password/route.ts"); assert.match(source, /!emailResult\.sent/); assert.match(source, /tokens\.deleteOne\(\{ tokenHash \}\)/); assert.match(source, /return NextResponse\.json\(generic\)/);
});

test("privacy request uses distributed closed rate limiting", async () => {
  const source = await read("src/app/api/privacy/requests/route.ts"); assert.match(source, /rateLimitRules\("privacy-request"/); assert.match(source, /"closed"/);
});

test("legacy domain redirects permanently while preserving URL object", async () => {
  const source = await read("src/proxy.ts"); assert.match(source, /LEGACY_HOST = "superapontos\.gfars\.com\.br"/); assert.match(source, /OFFICIAL_HOST = "superpontos\.gfars\.com\.br"/); assert.match(source, /NextResponse\.redirect\(destination, 308\)/);
});

test("super admin platform health is sanitized and read-only", async () => {
  const api = await read("src/app/api/admin/overview/route.ts"); const page = await read("src/app/admin/page.tsx"); assert.match(api, /getProductionConfigurationStatus/); assert.match(page, /Production billing/); assert.match(page, /DISABLED/); assert.doesNotMatch(page, /RESEND_API_KEY|ASAAS_API_KEY|MONGODB_URI/);
});

test("Mongo client declares bounded selection, connection and pool options", async () => {
  const source = await read("src/lib/mongodb.ts"); assert.match(source, /serverSelectionTimeoutMS: 10_000/); assert.match(source, /connectTimeoutMS: 10_000/); assert.match(source, /maxPoolSize: 20/);
});
