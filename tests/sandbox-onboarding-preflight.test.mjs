import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveCompanyOnboardingState } from "../src/lib/company-onboarding.ts";
import { getPricingQuote } from "../src/lib/plans.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const emptyCounts = { activeSchools: 0, admins: 0, educators: 0, students: 0, classes: 0, categories: 0, pointEvents: 0 };

test("preflight prices one unit on the server at R$ 119,90", () => {
  const quote = getPricingQuote(1);
  assert.equal(quote?.requestedUnits, 1);
  assert.equal(quote?.totalMonthlyCents, 11990);
});

test("local registration is transactional, normalized and starts financially blocked", async () => {
  const source = await read("src/app/api/companies/register/route.ts");
  assert.match(source, /normalizeDigits\(body\.cnpj\)/);
  assert.match(source, /session\.withTransaction/);
  assert.match(source, /role: "company_admin"/);
  assert.match(source, /status: "pending"/);
  assert.match(source, /requestedMaxUnits: pricing\.requestedUnits/);
  assert.match(source, /maxUnits: 0/);
  assert.match(source, /bcrypt\.hash\(password, 12\)/);
});

test("customer creation stays blocked and reconciles a stable company reference first", async () => {
  const source = await read("src/app/api/company/billing/customer/route.ts");
  assert.match(source, /BLOCK_ASAAS_CUSTOMER_CREATION = true/);
  assert.match(source, /externalReference: company\._id\.toString\(\)/);
  assert.ok(source.indexOf("findCompatibleCustomer(input)") < source.indexOf("createAsaasCustomer(input)"));
  assert.match(source, /providerCustomerLinkLock/);
});

test("subscription creation stays blocked and reconciles a stable local subscription reference first", async () => {
  const source = await read("src/app/api/company/billing/subscription/route.ts");
  assert.match(source, /BLOCK_ASAAS_SUBSCRIPTION_CREATION = true/);
  assert.match(source, /externalReference: `subscription:\$\{subscription\._id\.toString\(\)\}`/);
  assert.ok(source.indexOf("findAsaasSubscriptions(") < source.indexOf("createAsaasSubscription(input)"));
  assert.match(source, /providerSubscriptionLinkLock/);
});

test("initial payment requires exact customer, subscription, PENDING status and value", async () => {
  const source = await read("src/app/api/company/billing/subscription/route.ts");
  assert.match(source, /payment\.subscription === providerSubscriptionId/);
  assert.match(source, /payment\.customer === providerCustomerId/);
  assert.match(source, /payment\.status === "PENDING"/);
  assert.match(source, /PAYMENT_REFERENCE_CONFLICT/);
});

test("initial webhook uses requested units while maxUnits is zero", async () => {
  const source = await read("src/lib/billing-events.ts");
  assert.match(source, /Number\(subscription\.maxUnits \?\? 0\) > 0[\s\S]*subscription\.requestedMaxUnits/);
  assert.match(source, /subscriptionSet\.maxUnits = pricing\.requestedUnits/);
  assert.match(source, /status: "active"/);
});

test("webhook refuses missing or foreign provider ownership", async () => {
  const source = await read("src/lib/billing-events.ts");
  assert.match(source, /event\.payment\.subscription !== providerSubscriptionId/);
  assert.match(source, /event\.payment\.customer !== providerCustomerId/);
  assert.match(source, /typeof event\.payment\.value !== "number"/);
});

test("initial pending charge reuses the protected Pix GET route", async () => {
  const source = await read("src/app/api/company/billing/payment/[id]/pix/route.ts");
  assert.match(source, /export async function GET/);
  assert.match(source, /paymentId === link\.providerPaymentId/);
  assert.match(source, /\["PENDING", "OVERDUE"\]\.includes\(payment\.status\)/);
  assert.doesNotMatch(source, /export async function POST/);
});

test("legacy categories remain restricted to the canonical school", async () => {
  const source = await read("src/lib/category-scope.ts");
  assert.match(source, /schoolId\.toString\(\) === LEGACY_CATEGORY_SCHOOL_ID/);
  assert.match(source, /LEGACY_CATEGORY_IDS/);
});

test("onboarding completes only after a point event", () => {
  const company = { status: "active" };
  const subscription = { status: "active", requestedMaxUnits: 1, maxUnits: 1 };
  const configured = { ...emptyCounts, activeSchools: 1, admins: 1, educators: 1, students: 1, classes: 1, categories: 1 };
  assert.equal(deriveCompanyOnboardingState(company, subscription, configured), "setup_in_progress");
  assert.equal(deriveCompanyOnboardingState(company, subscription, { ...configured, pointEvents: 1 }), "completed");
});
