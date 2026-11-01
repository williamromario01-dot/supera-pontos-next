import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateMonthsEnd,
  exemptionProviderAction,
  isBillingExemptionActive,
  parseDateOnly,
} from "../src/lib/billing-exemption.ts";
import { getSubscriptionAccessState } from "../src/lib/subscription-access.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("period, month and indefinite exemptions resolve without fake payments", () => {
  const startsAt = parseDateOnly("2026-01-31");
  assert.ok(startsAt);
  assert.equal(calculateMonthsEnd(startsAt, 1).toISOString(), "2026-02-27T23:59:59.999Z");
  assert.equal(parseDateOnly("2026-02-30"), null);
  assert.equal(isBillingExemptionActive({
    status: "active",
    type: "indefinite",
    startsAt,
    endsAt: null,
  }, new Date("2030-01-01T00:00:00.000Z")), true);
});

test("active exemption overrides delinquency and expiry blocks until billing resumes", () => {
  const subscription = {
    status: "past_due",
    pastDueAt: new Date("2026-01-01T00:00:00.000Z"),
    billingExemption: {
      status: "active",
      type: "period",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-01-31T23:59:59.999Z"),
    },
  };
  const exempt = getSubscriptionAccessState(subscription, new Date("2026-01-15T00:00:00.000Z"));
  assert.equal(exempt.state, "exempt");
  assert.equal(exempt.canPerformOperationalMutation, true);
  const expired = getSubscriptionAccessState(subscription, new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(expired.state, "exemption_expired");
  assert.equal(expired.canPerformOperationalMutation, false);
});

test("existing subscription or pending charge requires provider action", () => {
  assert.deepEqual(exemptionProviderAction({}), {
    required: false,
    reason: null,
    pendingPaymentDetected: false,
    remoteSubscriptionDetected: false,
  });
  assert.equal(exemptionProviderAction({ providerSubscriptionId: "sub_1" }).reason, "active_subscription");
  assert.equal(exemptionProviderAction({ providerPaymentId: "pay_1" }).reason, "pending_payment");
});

test("admin exemption API is super-admin-only, audited and never mutates Asaas", async () => {
  const source = await read("src/app/api/admin/companies/[id]/billing-exemption/route.ts");
  assert.match(source, /auth\.role !== "super_admin"/);
  assert.match(source, /body as Record<string, unknown>/);
  assert.match(source, /item\.confirm !== true/);
  assert.match(source, /billingExemptionAudits/);
  assert.match(source, /previous,/);
  assert.match(source, /next,/);
  assert.match(source, /pending_provider_action/);
  assert.doesNotMatch(source, /billingEvents/);
  assert.doesNotMatch(source, /PAYMENT_(RECEIVED|CONFIRMED)/);
  assert.doesNotMatch(source, /createAsaas|updateAsaas|deleteAsaas|fetch\(/);
});

test("quantity changes during exemption remain local and report no Asaas mutation", async () => {
  const source = await read("src/app/api/company/billing/quantity/route.ts");
  assert.match(source, /isBillingExemptionActive\(subscription\.billingExemption\)/);
  assert.match(source, /completed_during_exemption/);
  assert.match(source, /asaasUpdatePerformed: false/);
  assert.match(source, /effectiveAfterPayment: false/);
});

test("company financial UI uses exemption language instead of payment language", async () => {
  const [summary, page] = await Promise.all([
    read("src/app/api/company/billing/summary/route.ts"),
    read("src/app/company/billing/page.tsx"),
  ]);
  assert.match(summary, /statusLabel: access\.state === "exempt"[\s\S]*"Mensalidade isenta"/);
  assert.match(page, /Mensalidade isenta/);
  assert.match(page, /Nenhuma confirmação de pagamento foi criada/);
});
