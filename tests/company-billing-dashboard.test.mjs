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

test("browser uses only internal billing APIs", () => {
  assert.match(page, /api\/company\/billing\/summary/);
  assert.match(page, /api\/company\/billing\/quantity/);
  assert.doesNotMatch(page, /api\.asaas|providerSubscriptionId|providerCustomerId/);
});

test("quantity modal supports the trusted 1 to 10 quote", () => {
  assert.match(page, /Alterar quantidade de unidades/);
  assert.match(page, /Quantidade atual contratada/);
  assert.match(page, /data\.pricingOptions.*\.map/);
  assert.match(page, /option\.pricePerUnitCents/);
  assert.match(page, /option\.totalMonthlyCents/);
  assert.match(page, /Você está aumentando seu plano/);
  assert.match(page, /Você está reduzindo seu plano/);
  assert.match(page, /Esta já é a quantidade contratada/);
});

test("unsafe and conflicting choices cannot be confirmed in the UI", () => {
  assert.match(page, /selected\s*<\s*plan\.activeUnits/);
  assert.match(page, /same\s*\|\|\s*blocked\s*\|\|\s*pending/);
  assert.match(page, /primeiro arquive as unidades excedentes/);
  assert.match(page, /Confirmar aumento do plano/);
  assert.match(page, /Confirmar redução do plano/);
});

test("POST sends only requestedUnits and blocks double submission", () => {
  assert.match(page, /JSON\.stringify\(\{\s*requestedUnits:\s*selected\s*\}\)/);
  assert.match(page, /if\s*\(posting\.current/);
  assert.match(page, /posting\.current\s*=\s*true/);
  assert.doesNotMatch(page, /JSON\.stringify\(\{[^}]*companyId/);
  assert.doesNotMatch(page, /JSON\.stringify\(\{[^}]*price/);
  assert.doesNotMatch(page, /JSON\.stringify\(\{[^}]*monthlyValue/);
});

test("operation feedback is sanitized and summary is refetched", () => {
  assert.match(page, /DOWNGRADE_REQUIRES_UNIT_REDUCTION/);
  assert.match(page, /PROVIDER_PENDING_PAYMENT_CONFLICT/);
  assert.match(page, /QUANTITY_CHANGE_IN_PROGRESS/);
  assert.match(page, /Seu plano será atualizado após a confirmação do pagamento/);
  assert.match(page, /finally\s*\{\s*await load\(\)/);
  assert.doesNotMatch(page, /stack|payload bruto/);
  assert.doesNotMatch(page, /createPayment|createAsaas|\/payments/);
});
