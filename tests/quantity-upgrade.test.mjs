import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getPricingQuote, getQuantityChangeQuote } from "../src/lib/plans.ts";
import {
  canCompleteQuantityChange,
  isOpenQuantityChange,
  matchesQuantityChangePayment,
  parseQuantityChangeRequest,
} from "../src/lib/quantity-change.ts";

const change = {
  type: "upgrade",
  status: "pending_payment",
  fromUnits: 1,
  toUnits: 2,
  previousMonthlyValueCents: 11990,
  targetMonthlyValueCents: 23180,
  providerPaymentId: "pay_upgrade_example",
  providerSubscriptionId: "sub_example",
  providerCustomerId: "cus_example",
};

const upgradePayment = {
  id: "pay_upgrade_example",
  subscription: "sub_example",
  customer: "cus_example",
  value: 231.8,
};

test("server-side quote for two units is authoritative", () => {
  assert.deepEqual(getPricingQuote(2), {
    requestedUnits: 2,
    pricePerUnitCents: 11590,
    totalMonthlyCents: 23180,
    individualTotalMonthlyCents: 23980,
    economyMonthlyCents: 800,
    billingInterval: "monthly",
    pricingModel: "quantity_monthly_v1",
  });
  assert.equal(getQuantityChangeQuote(1, 2, 1)?.changeType, "upgrade");
});

test("browser can provide only the requested unit count", () => {
  assert.equal(parseQuantityChangeRequest({ requestedUnits: 2 }), 2);
  assert.equal(parseQuantityChangeRequest({ requestedUnits: 2, value: 0.01 }), null);
  assert.equal(parseQuantityChangeRequest({ requestedUnits: 2, companyId: "other" }), null);
  assert.equal(parseQuantityChangeRequest({ requestedUnits: 2, providerSubscriptionId: "sub_other" }), null);
});

test("pending upgrade remains open and only its exact payment matches", () => {
  assert.equal(isOpenQuantityChange(change), true);
  assert.equal(matchesQuantityChangePayment(change, upgradePayment), true);
  assert.equal(canCompleteQuantityChange(change), true);
  assert.equal(matchesQuantityChangePayment(change, {
    ...upgradePayment,
    id: "pay_old_received",
    value: 119.9,
  }), false);
  assert.equal(matchesQuantityChangePayment(change, {
    ...upgradePayment,
    value: 119.9,
  }), false);
  assert.equal(matchesQuantityChangePayment(change, {
    ...upgradePayment,
    subscription: "sub_other",
  }), false);
  assert.equal(matchesQuantityChangePayment(change, {
    ...upgradePayment,
    customer: "cus_other",
  }), false);
});

test("completed delivery is recognizable but cannot complete twice", () => {
  const completed = { ...change, status: "completed" };
  assert.equal(matchesQuantityChangePayment(completed, upgradePayment), true);
  assert.equal(canCompleteQuantityChange(completed), false);
  assert.equal(isOpenQuantityChange(completed), false);
});

test("downgrade quote below real schools is rejected", () => {
  assert.equal(getQuantityChangeQuote(2, 1, 2), null);
});

test("route derives identity and price server-side and uses an atomic lock", async () => {
  const source = await readFile(
    new URL("../src/app/api/company/billing/quantity/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /auth\.role !== "company_admin"/);
  assert.match(source, /companyId: auth\.companyId/);
  assert.match(source, /parseQuantityChangeRequest\(body\)/);
  assert.match(source, /"quantityChange\.lockToken": lockToken/);
  assert.match(source, /updateAsaasSubscriptionValue/);
  assert.doesNotMatch(source, /createAsaasSubscription/);
  assert.doesNotMatch(source, /body[^\n]*companyId/);
  assert.doesNotMatch(source, /body[^\n]*(price|value|providerSubscriptionId)/);
});

test("webhook keeps provider event idempotency and gates capacity by payment", async () => {
  const source = await readFile(
    new URL("../src/lib/billing-events.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /providerEventId: event\.id/);
  assert.match(source, /matchesQuantityChangePayment/);
  assert.match(source, /subscriptionSet\.maxUnits = subscription\.quantityChange\.toUnits/);
  assert.match(source, /canCompleteQuantityChange/);
});
