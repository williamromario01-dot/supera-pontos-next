import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getPricingQuote, getQuantityChangeQuote } from "../src/lib/plans.ts";
import {
  canCompleteQuantityChange,
  hasCapacityForQuantityChange,
  matchesQuantityChangePayment,
  parseQuantityChangeRequest,
} from "../src/lib/quantity-change.ts";
import { isSchoolActive } from "../src/lib/schools.ts";

const downgrade = {
  type: "downgrade",
  status: "pending_payment",
  fromUnits: 2,
  toUnits: 1,
  previousMonthlyValueCents: 23180,
  targetMonthlyValueCents: 11990,
  providerPaymentId: "pay_downgrade_example",
  providerSubscriptionId: "sub_example",
  providerCustomerId: "cus_example",
};

const pendingPayment = {
  id: "pay_downgrade_example",
  subscription: "sub_example",
  customer: "cus_example",
  value: 119.9,
};

test("server-side downgrade quote requires enough active capacity", () => {
  assert.equal(getQuantityChangeQuote(2, 1, 2), null);
  assert.equal(isSchoolActive({ status: "archived" }), false);
  assert.deepEqual(getPricingQuote(1), {
    requestedUnits: 1,
    pricePerUnitCents: 11990,
    totalMonthlyCents: 11990,
    individualTotalMonthlyCents: 11990,
    economyMonthlyCents: 0,
    billingInterval: "monthly",
    pricingModel: "quantity_monthly_v1",
  });
  assert.equal(getQuantityChangeQuote(2, 1, 1)?.changeType, "downgrade");
});

test("downgrade matches only the exact provider payment and capacity", () => {
  assert.equal(matchesQuantityChangePayment(downgrade, pendingPayment), true);
  assert.equal(matchesQuantityChangePayment(downgrade, { ...pendingPayment, id: "pay_other" }), false);
  assert.equal(matchesQuantityChangePayment(downgrade, { ...pendingPayment, value: 231.8 }), false);
  assert.equal(canCompleteQuantityChange(downgrade), true);
  assert.equal(hasCapacityForQuantityChange(downgrade, 1), true);
  assert.equal(hasCapacityForQuantityChange(downgrade, 2), false);
});

test("browser identity and prices cannot control downgrade", () => {
  assert.equal(parseQuantityChangeRequest({ requestedUnits: 1 }), 1);
  assert.equal(parseQuantityChangeRequest({ requestedUnits: 1, companyId: "other" }), null);
  assert.equal(parseQuantityChangeRequest({ requestedUnits: 1, value: 0.01 }), null);
  assert.equal(parseQuantityChangeRequest({ requestedUnits: 1, pricePerUnitCents: 1 }), null);
});

test("quantity route reuses one subscription and reconciles before PUT", async () => {
  const source = await readFile(
    new URL("../src/app/api/company/billing/quantity/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /findAsaasSubscriptions/);
  assert.match(source, /compatibleSubscriptions\.length !== 1/);
  assert.match(source, /changeType[\s\S]*"downgrade"/);
  assert.match(source, /type: changeType/);
  assert.match(source, /requestedMaxUnits: quote\.requestedUnits/);
  assert.match(source, /updateAsaasSubscriptionValue/);
  assert.match(source, /if \(!snapshot\.canUpdate\)/);
  assert.doesNotMatch(source, /createAsaasCustomer|createAsaasSubscription|createAsaasPayment/);
  assert.doesNotMatch(source, /deleteOne|deleteMany/);
});

test("webhook gates downgrade completion on real active-school count", async () => {
  const source = await readFile(
    new URL("../src/lib/billing-events.ts", import.meta.url),
    "utf8",
  );
  const capacityRead = source.indexOf("activeUnitsForCompletion = await");
  const maxUnitsWrite = source.indexOf("subscriptionSet.maxUnits =");
  assert.ok(capacityRead >= 0);
  assert.ok(maxUnitsWrite > capacityRead);
  assert.match(source, /hasCapacityForQuantityChange/);
  assert.match(source, /ACTIVE_UNITS_EXCEED_DOWNGRADE_TARGET/);
  assert.match(source, /capacity_conflict/);
  assert.match(source, /providerEventId: event\.id/);
});

test("downgrade flow never mutates archived school records", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/app/api/company/billing/quantity/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/billing-events.ts", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /archivedAt|archivedBy/);
    assert.doesNotMatch(source, /collection\("schools"\)\.delete/);
  }
});
