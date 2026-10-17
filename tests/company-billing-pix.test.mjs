import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/company/billing/page.tsx", import.meta.url), "utf8");
const summary = await readFile(new URL("../src/app/api/company/billing/summary/route.ts", import.meta.url), "utf8");
const pixRoute = await readFile(new URL("../src/app/api/company/billing/payment/[id]/pix/route.ts", import.meta.url), "utf8");
const provider = await readFile(new URL("../src/lib/asaas-subscriptions.ts", import.meta.url), "utf8");
const pixClient = page.slice(
  page.indexOf("async function openPix"),
  page.indexOf("async function submit"),
);

test("no pending payment renders only the empty state without an action", () => {
  assert.match(page, /data\.remote\.pendingPayment\s*\?/);
  assert.match(page, /Não há pagamentos pendentes no momento/);
  assert.match(page, /payment\.action &&/);
});

test("pending card shows amount, due date, status and payment action", () => {
  assert.match(page, /money\(payment\.valueCents\)/);
  assert.match(page, /date\(payment\.dueDate\)/);
  assert.match(page, /payment\.statusLabel/);
  assert.match(page, /Pagar agora/);
  assert.match(summary, /payment\.status === "PENDING"/);
});

test("Pix modal calls only the opaque internal GET route", () => {
  assert.match(page, /fetch\(payment\.action\.href,\s*\{\s*method: "GET"/s);
  assert.match(summary, /api\/company\/billing\/payment\/\$\{payment\.id\}\/pix/);
  assert.doesNotMatch(page, /api(?:-sandbox)?\.asaas\.com|access_token|ASAAS_API_KEY/);
  assert.doesNotMatch(pixClient, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
});

test("QR, copy-and-paste and optional expiration are handled in memory", () => {
  assert.match(page, /alt="QR Code Pix"/);
  assert.match(page, /data:image\/png;base64/);
  assert.match(page, /Pix copia e cola/);
  assert.match(page, /navigator\.clipboard\.writeText\(pix\.payload\)/);
  assert.match(page, /Código Pix copiado!/);
  assert.match(page, /pix\.expirationDate &&/);
  assert.match(page, /Este código Pix é válido até/);
  assert.match(provider, /expirationDate\?: string/);
});

test("payment ownership and status are revalidated server-side", () => {
  assert.match(pixRoute, /auth\.role !== "company_admin"/);
  assert.match(pixRoute, /companyId: auth\.companyId/);
  assert.match(pixRoute, /payment\.subscription !== subscription\.providerSubscriptionId/);
  assert.match(pixRoute, /payment\.customer !== subscription\.providerCustomerId/);
  assert.match(pixRoute, /payment\.status !== "PENDING"/);
  assert.doesNotMatch(pixRoute, /request\.json\(/);
});

test("BOLETO remains eligible for server-side Pix data without billing mutation", () => {
  assert.doesNotMatch(pixRoute, /payment\.billingType !== "PIX"/);
  assert.match(pixRoute, /getAsaasPaymentPixQrCode/);
  assert.doesNotMatch(pixRoute, /updateAsaas|createAsaas|method:\s*"POST"|method:\s*"PUT"/);
});

test("received payments lose the action and remain in history as paid", () => {
  assert.match(summary, /action: payment\.status === "PENDING"/);
  assert.match(summary, /payments: orderedPayments\.map/);
  assert.match(summary, /paymentStatusLabel\(payment\.status\)/);
});

test("quantity-change and recurring pending payments both work", () => {
  assert.match(summary, /relatedToQuantityChange/);
  assert.match(page, /Este pagamento confirma sua alteração de plano/);
  assert.match(page, /payment\.relatedToQuantityChange && quantityChange/);
  assert.match(page, /payment\.action &&/);
});

test("status refresh cannot confirm payment and provider errors stay sanitized", () => {
  assert.match(page, /refreshPixStatus/);
  assert.match(page, /await load\(\)/);
  assert.match(page, /Não foi possível carregar os dados Pix agora/);
  assert.doesNotMatch(page, /confirmPayment|webhook|encodedImage.*console|payload.*console/);
  assert.doesNotMatch(pixRoute, /encodedImage.*console|payload.*console/);
  assert.match(pixRoute, /Não foi possível obter o Pix desta cobrança/);
});
