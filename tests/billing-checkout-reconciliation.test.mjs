import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BillingReconciliationError,
  maskProviderIdentifier,
  reconcileExistingCheckout,
} from "../src/lib/billing-checkout-reconciliation-core.ts";

const subscriptionId = "sub_existing_production";
const customerId = "cus_existing_production";
const paymentId = "pay_existing_production";
const externalReference = "subscription:6ace5ca054b8a80fa371c4f7";

const remoteSubscription = {
  id: subscriptionId,
  customer: customerId,
  billingType: "PIX",
  value: 119.9,
  cycle: "MONTHLY",
  nextDueDate: "2026-10-24",
  externalReference,
};

const remotePayment = {
  id: paymentId,
  customer: customerId,
  subscription: subscriptionId,
  billingType: "PIX",
  status: "PENDING",
  dueDate: "2026-10-24",
  value: 119.9,
};

function fixture(overrides = {}) {
  const state = {
    customers: [customerId],
    subscriptions: [remoteSubscription],
    payments: [remotePayment],
    persistedPaymentIds: [],
    gets: 0,
    lists: 0,
    saves: 0,
  };
  const link = {
    providerCustomerId: customerId,
    providerSubscriptionId: subscriptionId,
    ...overrides,
  };
  const ports = {
    async getSubscription() {
      state.gets += 1;
      return remoteSubscription;
    },
    async listPayments() {
      state.lists += 1;
      return state.payments;
    },
    async savePaymentLink(payment) {
      state.saves += 1;
      state.persistedPaymentIds.push(payment.id);
      link.providerPaymentId = payment.id;
    },
  };
  return { state, link, ports };
}

async function reconcile(link, ports) {
  return reconcileExistingCheckout({
    link,
    externalReference,
    expectedValueCents: 11990,
  }, ports);
}

test("recovers the existing Production payment after partial persistence without creating anything", async () => {
  const { state, link, ports } = fixture();
  const result = await reconcile(link, ports);

  assert.equal(result.pendingPayment?.id, paymentId);
  assert.equal(link.providerPaymentId, paymentId);
  assert.deepEqual(state.persistedPaymentIds, [paymentId]);
  assert.equal(state.customers.length, 1);
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.payments.length, 1);
  assert.equal(result.subscription.externalReference, externalReference);
  assert.equal(Math.round(result.subscription.value * 100), 11990);
});

test("reload and HTTP retry reuse the payment link and keep one customer, subscription and payment", async () => {
  const { state, link, ports } = fixture();
  await reconcile(link, ports);
  await reconcile(link, ports);

  assert.equal(state.customers.length, 1);
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.payments.length, 1);
  assert.equal(state.saves, 1);
  assert.equal(link.providerPaymentId, paymentId);
});

test("two concurrent reconciliations converge on the same existing payment", async () => {
  const { state, link, ports } = fixture();
  const [left, right] = await Promise.all([
    reconcile(link, ports),
    reconcile(link, ports),
  ]);

  assert.equal(left.pendingPayment?.id, paymentId);
  assert.equal(right.pendingPayment?.id, paymentId);
  assert.deepEqual(new Set(state.persistedPaymentIds), new Set([paymentId]));
  assert.equal(state.customers.length, 1);
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.payments.length, 1);
});

test("a linked payment is reused without another persistence write", async () => {
  const { state, link, ports } = fixture({ providerPaymentId: paymentId });
  const result = await reconcile(link, ports);
  assert.equal(result.pendingPayment?.id, paymentId);
  assert.equal(state.saves, 0);
});

test("missing generated payment remains processing and can be recovered on a later reload", async () => {
  const { state, link, ports } = fixture();
  state.payments = [];
  const first = await reconcile(link, ports);
  assert.equal(first.pendingPayment, null);
  assert.equal(state.saves, 0);

  state.payments = [remotePayment];
  const second = await reconcile(link, ports);
  assert.equal(second.pendingPayment?.id, paymentId);
  assert.equal(state.saves, 1);
});

test("timeouts after customer, subscription or remote payment never create duplicates and a retry recovers", async () => {
  const { state, link, ports } = fixture();
  const stableGet = ports.getSubscription;
  const stableList = ports.listPayments;

  ports.getSubscription = async () => { throw new Error("ASAAS_TIMEOUT"); };
  await assert.rejects(reconcile(link, ports), /ASAAS_TIMEOUT/);
  assert.equal(state.saves, 0);

  ports.getSubscription = stableGet;
  ports.listPayments = async () => { throw new Error("ASAAS_TIMEOUT"); };
  await assert.rejects(reconcile(link, ports), /ASAAS_TIMEOUT/);
  assert.equal(state.saves, 0);

  ports.listPayments = stableList;
  const recovered = await reconcile(link, ports);
  assert.equal(recovered.pendingPayment?.id, paymentId);
  assert.equal(state.customers.length, 1);
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.payments.length, 1);
});

test("ownership, externalReference, environment link and price conflicts fail closed", async () => {
  const cases = [
    fixture({ providerCustomerId: "cus_other" }),
    fixture({ providerSubscriptionId: "sub_other" }),
  ];
  for (const item of cases) {
    await assert.rejects(
      reconcile(item.link, item.ports),
      (error) => error instanceof BillingReconciliationError,
    );
    assert.equal(item.state.saves, 0);
  }

  const wrongPayment = fixture();
  wrongPayment.state.payments = [{ ...remotePayment, value: 1 }];
  const result = await reconcile(wrongPayment.link, wrongPayment.ports);
  assert.equal(result.pendingPayment, null);
  assert.equal(wrongPayment.state.saves, 0);
});

test("overdue existing payment remains eligible for reconciliation and Pix", async () => {
  const { state, link, ports } = fixture();
  state.payments = [{ ...remotePayment, status: "OVERDUE" }];
  const result = await reconcile(link, ports);
  assert.equal(result.pendingPayment?.id, paymentId);
  assert.equal(link.providerPaymentId, paymentId);
});

test("integration uses read-only Asaas calls, Production-scoped links, safe logs and the existing Pix route", async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const [adapter, provider, summary, subscriptionRoute, pixRoute, events] = await Promise.all([
    read("src/lib/billing-checkout-reconciliation.ts"),
    read("src/lib/asaas-subscriptions.ts"),
    read("src/app/api/company/billing/summary/route.ts"),
    read("src/app/api/company/billing/subscription/route.ts"),
    read("src/app/api/company/billing/payment/[id]/pix/route.ts"),
    read("src/lib/billing-events.ts"),
  ]);

  assert.match(adapter, /getAsaasSubscription/);
  assert.match(adapter, /listAsaasSubscriptionPayments/);
  assert.match(adapter, /upsertBillingProviderLink/);
  assert.doesNotMatch(adapter, /createAsaas|updateAsaas|deleteAsaas/);
  assert.match(adapter, /environment: input\.environment/);
  assert.match(adapter, /correlationId/);
  assert.match(adapter, /conflictField/);
  assert.match(adapter, /safeDetails/);
  assert.doesNotMatch(adapter, /apiKey|access_token|Authorization|encodedImage|payload/);
  assert.match(provider, /`\/subscriptions\/\$\{encodeURIComponent\(subscriptionId\)\}\/payments`/);
  assert.doesNotMatch(provider, /\/payments\?limit=/);
  assert.match(summary, /reconcileExistingBillingCheckout/);
  assert.match(subscriptionRoute, /billingSubscription\.providerSubscriptionId/);
  assert.match(pixRoute, /paymentId === link\.providerPaymentId/);
  assert.match(events, /subscriptionSet\.status = "active"/);
  assert.match(events, /subscriptionSet\.maxUnits = pricing\.requestedUnits/);
  assert.match(events, /providerEnvironment/);
  assert.match(events, /return "duplicate"/);
});

test("each subscription validation reports the exact safe conflict field and stays fail-closed", async () => {
  const cases = [
    {
      field: "providerSubscriptionId",
      remote: { id: "sub_different_production" },
      expectedKey: "expectedProviderSubscriptionId",
      actualKey: "actualProviderSubscriptionId",
    },
    {
      field: "providerCustomerId",
      remote: { customer: "cus_different_production" },
      expectedKey: "expectedProviderCustomerId",
      actualKey: "actualProviderCustomerId",
    },
    {
      field: "externalReference",
      remote: { externalReference: "subscription:ffffffffffffffffffffffff" },
      expectedKey: "expectedExternalReference",
      actualKey: "actualExternalReference",
    },
    {
      field: "cycle",
      remote: { cycle: "YEARLY" },
      expectedKey: "expectedCycle",
      actualKey: "actualCycle",
    },
    {
      field: "value",
      remote: { value: 120.9 },
      expectedKey: "expectedValueCents",
      actualKey: "actualValueCents",
    },
  ];

  for (const entry of cases) {
    const { state, link, ports } = fixture();
    ports.getSubscription = async () => {
      state.gets += 1;
      return { ...remoteSubscription, ...entry.remote };
    };
    await assert.rejects(reconcile(link, ports), (error) => {
      assert.ok(error instanceof BillingReconciliationError);
      assert.equal(error.code, "PROVIDER_SUBSCRIPTION_CONFLICT");
      assert.equal(error.conflictField, entry.field);
      assert.ok(Object.hasOwn(error.safeDetails, entry.expectedKey));
      assert.ok(Object.hasOwn(error.safeDetails, entry.actualKey));
      return true;
    });
    assert.equal(state.gets, 1);
    assert.equal(state.lists, 0);
    assert.equal(state.saves, 0);
  }
});

test("provider identifiers are masked and unsafe external references are redacted", async () => {
  assert.equal(maskProviderIdentifier("cus_sensitive_123456789"), "cus_…6789");
  assert.equal(maskProviderIdentifier("unsafe:value"), "<redacted>");

  const { link, ports } = fixture();
  ports.getSubscription = async () => ({
    ...remoteSubscription,
    externalReference: "contains-private-data@example.com",
  });
  await assert.rejects(reconcile(link, ports), (error) => {
    assert.equal(error.conflictField, "externalReference");
    assert.equal(error.safeDetails.actualExternalReference, "<redacted>");
    assert.equal(error.safeDetails.expectedExternalReference, externalReference);
    return true;
  });
});
