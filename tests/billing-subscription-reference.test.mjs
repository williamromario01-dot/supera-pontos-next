import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { legacyBillingSubscriptionReference } from "../src/lib/billing-subscription-reference.ts";
import { loadRoute } from "./helpers/load-route.mjs";

const sub = { _id: new ObjectId("6ace5ca054b8a80fa371c4f7"), companyId: new ObjectId("6ace5ca054b8a80fa371c4f5") };
const link = { _id: new ObjectId("6adcde3ca7306aec6a6098fc"), companyId: sub.companyId,
  internalSubscriptionId: sub._id, provider: "asaas", environment: "production",
  providerCustomerId: "cus_fixture", providerSubscriptionId: "sub_fixture" };

test("shared legacy reference supports ObjectId/string equality only for the owning link", () => {
  assert.equal(legacyBillingSubscriptionReference(sub, { ...link, internalSubscriptionId: String(sub._id), companyId: String(sub.companyId) }, "production"), `subscription:${link._id}`);
});
for (const patch of [
  { companyId: undefined }, { companyId: new ObjectId() }, { internalSubscriptionId: undefined },
  { internalSubscriptionId: new ObjectId() }, { environment: "sandbox" }, { provider: "other" },
  { _id: undefined }, { _id: "arbitrary-historical-id" },
]) test(`shared legacy reference refuses invalid ownership or ID: ${JSON.stringify(patch)}`, () => {
  assert.equal(legacyBillingSubscriptionReference(sub, { ...link, ...patch }, "production"), undefined);
});

test("checkout adapter still reconciles the same legacy subscription through the shared helper", async () => {
  let saves = 0;
  const adapter = loadRoute("src/lib/billing-checkout-reconciliation.ts", {
    "server-only": {},
    "@/lib/asaas-subscriptions": {
      getAsaasSubscription: async () => ({ id: link.providerSubscriptionId, customer: link.providerCustomerId,
        externalReference: `subscription:${link._id}`, value: 119.90, cycle: "MONTHLY", billingType: "PIX", nextDueDate: "2026-10-24" }),
      listAsaasSubscriptionPayments: async () => [{ id: "pay_fixture", subscription: link.providerSubscriptionId,
        customer: link.providerCustomerId, value: 119.90, billingType: "PIX", status: "OVERDUE", dueDate: "2026-10-24" }],
    },
    "@/lib/billing-provider-links": { upsertBillingProviderLink: async () => { saves++; } },
  });
  const result = await adapter.reconcileExistingBillingCheckout({ db: {}, subscription: sub, link,
    environment: "production", expectedValueCents: 11990, correlationId: "fixture" });
  assert.equal(result.pendingPayment.id, "pay_fixture"); assert.equal(saves, 1);
  await assert.rejects(adapter.reconcileExistingBillingCheckout({ db: {}, subscription: sub,
    link: { ...link, companyId: new ObjectId() }, environment: "production", expectedValueCents: 11990, correlationId: "fixture" }),
    error => error.conflictField === "externalReference");
  assert.equal(saves, 1);
});
