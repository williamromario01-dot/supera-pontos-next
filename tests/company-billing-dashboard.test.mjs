import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isPendingQuantityChange, paymentStatusLabel } from "../src/lib/billing-summary.ts";

const summary = await readFile(new URL("../src/app/api/company/billing/summary/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/company/billing/page.tsx", import.meta.url), "utf8");

test("only a pending quantity change is highlighted", () => {
  assert.equal(isPendingQuantityChange({ status: "pending_payment", type: "upgrade" }), true);
  assert.equal(isPendingQuantityChange({ status: "completed", type: "upgrade" }), false);
  assert.equal(paymentStatusLabel("RECEIVED"), "Pago");
});

test("summary derives company identity and prices on the server", () => {
  assert.match(summary, /auth\.role !== "company_admin"/);
  assert.match(summary, /companyId: auth\.companyId/);
  assert.match(summary, /getPricingQuote\(maxUnits\)/);
  assert.match(summary, /activeSchoolFilter\(auth\.companyId\)/);
  assert.doesNotMatch(summary, /request\.json\(/);
  assert.doesNotMatch(summary, /updateOne|insertOne|deleteOne/);
});

test("provider renewal and real pending payment remain distinct", () => {
  assert.match(summary, /nextDueDate: providerSubscription\.nextDueDate/);
  assert.match(summary, /payment\.status === "PENDING"/);
  assert.match(summary, /renewalPaymentGenerated/);
});

test("browser uses the internal summary and offers no quantity mutation", () => {
  assert.match(page, /api\/company\/billing\/summary/);
  assert.match(page, /Alterações são apenas informativas/);
  assert.doesNotMatch(page, /api\.asaas|providerSubscriptionId|providerCustomerId/);
  assert.doesNotMatch(page, /method:\s*["']POST["']/);
});
