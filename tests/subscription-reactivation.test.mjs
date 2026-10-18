import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getPricingQuote } from "../src/lib/plans.ts";
import { getSubscriptionAccessState } from "../src/lib/subscription-access.ts";
import {
  isOpenReactivation,
  matchesReactivationPayment,
  nextReactivationDueDate,
  parseReactivationRequest,
} from "../src/lib/subscription-reactivation.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const payment = { id: "pay_reactivation", customer: "cus_owner", subscription: "sub_same", status: "RECEIVED", value: 119.9 };
const reactivation = { status: "pending_payment", providerPaymentId: "pay_reactivation", providerCustomerId: "cus_owner", providerSubscriptionId: "sub_same", targetMonthlyValueCents: 11990 };

test("cancelled UI displays Reativar assinatura", async () => {
  const source = await read("src/app/company/billing/page.tsx");
  assert.match(source, /Assinatura encerrada/);
  assert.match(source, />Reativar assinatura</);
});

test("active UI does not expose reactivation action unconditionally", async () => {
  const source = await read("src/app/company/billing/page.tsx");
  assert.match(source, /reactivationAvailable && data\.access\?\.state === "cancelled"/);
});

test("cancellation_scheduled keeps using reversal", async () => {
  const source = await read("src/app/company/billing/page.tsx");
  assert.match(source, /canRevert[\s\S]*changeCancellation\("DELETE"\)/);
});

test("past_due is rejected by post-cancellation reactivation", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  assert.match(route, /subscription\.status === "past_due"/);
  assert.match(route, /SUBSCRIPTION_PAST_DUE/);
});

test("only company_admin can reactivate", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  assert.match(route, /auth\.role !== "company_admin"/);
});

test("browser companyId cannot control ownership", () => {
  assert.equal(parseReactivationRequest({ requestedUnits: 1, companyId: "other" }), null);
  assert.deepEqual(parseReactivationRequest({ requestedUnits: 1 }), { requestedUnits: 1 });
});

test("pricing is derived from the server plan table", () => {
  assert.deepEqual(getPricingQuote(1)?.totalMonthlyCents, 11990);
  assert.equal(parseReactivationRequest({ requestedUnits: 1 })?.requestedUnits, 1);
});

test("reactivation quantity must be a supported integer", () => {
  for (const value of [0, -1, 1.5, "1", null]) {
    assert.equal(parseReactivationRequest({ requestedUnits: value }), null);
  }
});

test("archived schools are never reactivated by the route", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  assert.doesNotMatch(route, /schools[^\n]*update/i);
  assert.match(route, /activeSchoolFilter/);
});

test("pedagogical data is not recreated", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  for (const collection of ["users", "students", "classes", "points"]) {
    assert.doesNotMatch(route, new RegExp(`collection\\(["']${collection}["']\\)`));
  }
});

test("reactivation_pending blocks operational mutations", () => {
  const access = getSubscriptionAccessState({ reactivation }, new Date());
  assert.equal(access.state, "reactivation_pending");
  assert.equal(access.canPerformOperationalMutation, false);
});

test("repeated request returns the existing pending operation", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  assert.match(route, /pendingResponse\(subscription\)/);
  assert.match(route, /idempotent: true/);
});

test("route never creates another provider subscription", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  assert.doesNotMatch(route, /createAsaasSubscription/);
  assert.match(route, /remotes\.length !== 1/);
});

test("wrong payment id cannot activate", () => {
  assert.equal(matchesReactivationPayment(reactivation, { ...payment, id: "pay_wrong" }), false);
});

test("payment from another company customer cannot activate", () => {
  assert.equal(matchesReactivationPayment(reactivation, { ...payment, customer: "cus_other" }), false);
});

test("PAYMENT_RECEIVED is accepted only after strict payment match", async () => {
  assert.equal(matchesReactivationPayment(reactivation, payment), true);
  const events = await read("src/lib/billing-events.ts");
  assert.match(events, /PAYMENT_RECEIVED/);
  assert.match(events, /reactivationMatches/);
});

test("PAYMENT_CONFIRMED is accepted only after strict payment match", async () => {
  assert.equal(matchesReactivationPayment(reactivation, { ...payment, status: "CONFIRMED" }), true);
  assert.match(await read("src/lib/billing-events.ts"), /PAYMENT_CONFIRMED/);
});

test("completed reactivation sets maxUnits from requestedUnits", async () => {
  assert.match(await read("src/lib/billing-events.ts"), /subscriptionSet\.maxUnits = subscription\.reactivation\.requestedUnits/);
});

test("unitCount is recalculated from active schools", async () => {
  const events = await read("src/lib/billing-events.ts");
  assert.match(events, /activeSchoolFilter\(subscription\.companyId/);
  assert.match(events, /unitCount: usedUnits/);
});

test("requestedMaxUnits is coherent after completion", async () => {
  assert.match(await read("src/lib/billing-events.ts"), /requestedMaxUnits = subscription\.reactivation\.requestedUnits/);
});

test("operations return automatically only after completion", () => {
  const completed = getSubscriptionAccessState({ status: "active", cancelAtPeriodEnd: false, reactivation: { status: "completed" } });
  assert.equal(completed.state, "active");
  assert.equal(completed.canPerformOperationalMutation, true);
});

test("pending reactivation payment reuses internal Pix infrastructure", async () => {
  const summary = await read("src/app/api/company/billing/summary/route.ts");
  assert.match(summary, /relatedToReactivation/);
  assert.match(summary, /\/api\/company\/billing\/payment\/\$\{payment\.id\}\/pix/);
});

test("no deletion is performed during reactivation", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  assert.doesNotMatch(route, /deleteOne|deleteMany|findOneAndDelete/);
});

test("provider errors are sanitized", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  assert.match(route, /Não foi possível iniciar a reativação agora/);
  assert.doesNotMatch(route, /error\.details/);
});

test("browser calls only the internal reactivation API", async () => {
  const page = await read("src/app/company/billing/page.tsx");
  assert.match(page, /fetch\("\/api\/company\/billing\/reactivation"/);
  assert.doesNotMatch(page, /api-sandbox\.asaas|api\.asaas/);
});

test("no activation occurs without valid financial confirmation", async () => {
  const route = await read("src/app/api/company/billing/reactivation/route.ts");
  const events = await read("src/lib/billing-events.ts");
  assert.match(route, /"reactivation\.status": "pending_payment"/);
  assert.doesNotMatch(route, /cancelAtPeriodEnd: false/);
  assert.match(events, /if \(reactivationMatches\)/);
});

test("next due date is deterministic and in the future", () => {
  assert.equal(nextReactivationDueDate(new Date("2026-10-18T23:59:00Z")), "2026-10-19");
});

test("open reactivation statuses are centralized", () => {
  assert.equal(isOpenReactivation({ status: "pending_payment" }), true);
  assert.equal(isOpenReactivation({ status: "completed" }), false);
});
