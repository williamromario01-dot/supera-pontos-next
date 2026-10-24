import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [checkout, summary, page, customer, subscription, events] = await Promise.all([
  read("src/app/api/company/billing/checkout/route.ts"),
  read("src/app/api/company/billing/summary/route.ts"),
  read("src/app/company/billing/page.tsx"),
  read("src/app/api/company/billing/customer/route.ts"),
  read("src/app/api/company/billing/subscription/route.ts"),
  read("src/lib/billing-events.ts"),
]);

test("checkout composes the existing idempotent customer and subscription flows", () => {
  assert.match(checkout, /POST as ensureCustomer/);
  assert.match(checkout, /POST as ensureSubscription/);
  assert.ok(checkout.indexOf("await ensureCustomer") < checkout.indexOf("await ensureSubscription"));
  assert.match(checkout, /auth\.role !== "company_admin"/);
  assert.match(checkout, /customerCreationBlocked/);
  assert.match(checkout, /subscriptionCreationBlocked/);
  assert.match(checkout, /CHECKOUT_MUTATIONS_BLOCKED/);
  assert.doesNotMatch(checkout, /api\.asaas|createAsaasCustomer|createAsaasSubscription/);
});

test("checkout returns only an internal PIX action and never activates locally", () => {
  assert.match(checkout, /payment_pending/);
  assert.match(checkout, /api\/company\/billing\/payment\/\$\{link\.providerPaymentId\}\/pix/);
  assert.doesNotMatch(checkout, /status:\s*"active"|company.*active|updateOne|insertOne/);
  assert.match(events, /subscriptionSet\.status = "active"/);
});

test("checkout is initiated only by the explicit browser action", () => {
  assert.match(page, /async function startCheckout/);
  assert.match(page, /fetch\("\/api\/company\/billing\/checkout",\s*\{\s*method: "POST"/);
  assert.match(page, /"Gerar pagamento"/);
  const effect = page.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[\]\);/)?.[1] ?? "";
  assert.match(effect, /load\(\)/);
  assert.doesNotMatch(effect, /startCheckout|billing\/checkout|method:\s*"POST"/);
});

test("summary preserves active capacity while pricing the requested initial plan", () => {
  assert.match(summary, /const maxUnits = Number\(subscription\.maxUnits/);
  assert.match(summary, /const requestedMaxUnits = Number\(subscription\.requestedMaxUnits/);
  assert.match(summary, /const requestedPricing = getPricingQuote\(requestedMaxUnits\)/);
  assert.match(summary, /const pricing = maxUnits > 0 \? activePricing : requestedPricing/);
  assert.match(summary, /availableUnits = Math\.max\(0, maxUnits - activeUnits\)/);
  assert.match(summary, /state: "not_started"/);
  assert.match(summary, /state: "processing"/);
  assert.match(summary, /state: "reconciliation_required"/);
  assert.match(summary, /state: "provider_error"/);
  assert.match(summary, /state: "payment_pending"/);
  assert.match(summary, /state: "active"/);
});

test("underlying mutations retain locks, uncertainty markers and environment gates", () => {
  assert.match(customer, /providerCustomerLinkLock/);
  assert.match(customer, /providerCustomerCreateUncertainAt/);
  assert.match(customer, /assertAsaasMutationAllowed\(environment, "customer_creation"\)/);
  assert.match(subscription, /providerSubscriptionLinkLock/);
  assert.match(subscription, /providerSubscriptionCreateUncertainAt/);
  assert.match(subscription, /assertAsaasMutationAllowed\(environment, "subscription_creation"\)/);
});
