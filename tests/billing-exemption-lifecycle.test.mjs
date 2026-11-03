import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { loadRoute } from "./helpers/load-route.mjs";

const now = new Date("2026-11-03T12:00:00Z");
const companyId = new ObjectId("6ace5ca054b8a80fa371c4f5");
const subscriptionId = new ObjectId("6ace5ca054b8a80fa371c4f7");
const grant = () => ({ type: "indefinite", startsAt: new Date("2026-11-01Z"), endsAt: null, months: null, reason: "Minha escola" });
const get = (obj, key) => key.split(".").reduce((v, k) => v?.[k], obj);
function set(obj, key, value) { const keys = key.split("."); const leaf = keys.pop(); let target = obj; for (const k of keys) target = target[k] ??= {}; target[leaf] = value; }
function matches(obj, filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (k === "$or") return v.some(f => matches(obj, f));
    const actual = get(obj, k);
    if (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof ObjectId)) {
      return Object.entries(v).every(([op, val]) => op === "$exists" ? (actual !== undefined) === val : op === "$lte" ? actual <= val : op === "$nin" ? !val.includes(actual) : op === "$ne" ? actual !== val : op === "$in" ? val.includes(actual) : false);
    }
    if (v instanceof ObjectId) return String(actual) === String(v);
    if (v instanceof Date) return actual?.getTime() === v.getTime();
    return actual === v;
  });
}
function fixture(options = {}) {
  const sub = { _id: subscriptionId, companyId, updatedAt: new Date("2026-11-02Z"), status: "past_due", requestedMaxUnits: 1, maxUnits: 0, unitCount: 0, totalMonthlyCents: 11990,
    billingExemption: { ...grant(), status: "pending_provider_action" }, ...options.sub };
  const link = { _id: new ObjectId(), companyId, internalSubscriptionId: subscriptionId, environment: options.linkEnvironment ?? "sandbox", provider: "asaas", providerCustomerId: "cus_fixture", providerSubscriptionId: "sub_fixture" };
  const remote = { id: "sub_fixture", customer: "cus_fixture", externalReference: `subscription:${subscriptionId}`, cycle: "MONTHLY", status: "ACTIVE", value: 119.90, nextDueDate: "2026-10-24", ...options.remote };
  const payments = options.payments ?? [];
  const audits = [], calls = [], receipts = [], billingEvents = [];
  let failSuspend = options.failSuspend, failResume = options.failResume;
  const session = { withTransaction: async fn => fn(), endSession: async () => {} };
  const db = { client: { startSession: () => session }, collection(name) {
    if (name === "subscriptions") return {
      findOne: async f => matches(sub, f) ? sub : null,
      updateOne: async (filter, update) => {
        if (!matches(sub, filter)) return { modifiedCount: 0 };
        for (const [k, v] of Object.entries(update.$set ?? {})) set(sub, k, v);
        for (const k of Object.keys(update.$unset ?? {})) { const keys = k.split("."); const leaf = keys.pop(); const obj = keys.reduce((o, k) => o?.[k], sub); if (obj) delete obj[leaf]; }
        return { modifiedCount: 1 };
      },
    };
    if (name === "billingProviderLinks") return { find: () => ({ toArray: async () => options.noLink ? [] : [link] }), findOne: async f => matches(link, f) ? link : null, updateOne: async () => ({ modifiedCount: 1 }) };
    if (name === "schools") return { countDocuments: async () => options.actualUnits ?? 0 };
    if (name === "billingExemptionAudits") return { insertOne: async value => audits.push(value) };
    if (name === "billingEvents") return { updateMany: async () => {}, createIndex: async () => {}, listIndexes: () => ({ toArray: async () => [] }), findOne: async f => billingEvents.find(r => matches(r, f)), insertOne: async r => billingEvents.push(r) };
    if (name === "billingExemptionWebhookReceipts") return { createIndex: async () => {}, findOne: async f => receipts.find(r => matches(r, f)), insertOne: async r => receipts.push(r) };
    if (name === "companies") return { findOne: async () => ({ _id: companyId, status: "active" }), updateOne: async () => ({ modifiedCount: 1 }) };
    throw Error(`Unmocked collection ${name}`);
  } };
  const mocks = { "server-only": {}, "@/lib/asaas": { getAsaasEnvironment: () => options.environment ?? "sandbox" },
    "@/lib/asaas-production": { assertAsaasMutationAllowed: () => { if (options.gateBlocked) throw Error("blocked"); } },
    "@/lib/asaas-subscriptions": {
      getAsaasSubscription: async () => { calls.push("getSubscription"); return { ...remote }; },
      listAllAsaasSubscriptionPayments: async () => payments.map(p => ({ ...p })),
      getAsaasPayment: async id => ({ ...payments.find(p => p.id === id) }),
      suspendAsaasSubscription: async () => { calls.push("suspend"); if (failSuspend) { failSuspend = false; if (options.lostSuspendResponse) remote.status = "INACTIVE"; throw Error("secret raw provider error"); } remote.status = "INACTIVE"; },
      reactivateAsaasSubscription: async (id, input) => { calls.push(["resume", input]); if (failResume) { failResume = false; throw Error("failed"); } Object.assign(remote, input, { status: "ACTIVE" }); },
      removeAsaasExemptedPayment: async id => { calls.push(["remove", id]); payments.find(p => p.id === id).deleted = true; },
    } };
  const service = loadRoute("src/lib/billing-exemption-lifecycle.ts", mocks);
  return { sub, remote, payments, db, calls, audits, service, mocks };
}
const payment = (status, id = "pay_fixture") => ({ id, customer: "cus_fixture", subscription: "sub_fixture", status, billingType: "PIX", value: 119.90, dueDate: "2026-10-24" });
const preserve = { policy: "preserve", paymentIds: [] };
const activate = (f, decision = preserve, g = grant()) => f.service.runExemption(f.db, f.sub, "fixture-super-admin", { grant: g, decision }, now);

test("real local fixture activates without a remote subscription and releases one unit", async () => {
  const f = fixture({ noLink: true }); const result = await activate(f);
  assert.equal(result.status, "active"); assert.equal(f.sub.maxUnits, 1); assert.equal(f.sub.requestedMaxUnits, 1); assert.equal(f.sub.unitCount, 0); assert.equal(f.sub.totalMonthlyCents, 11990); assert.deepEqual(f.calls, []);
});
test("active subscription is suspended and re-read before local activation", async () => {
  const f = fixture(); await activate(f); assert.equal(f.remote.status, "INACTIVE"); assert.equal(f.sub.status, "active"); assert.equal(f.sub.billingExemption.providerState, "INACTIVE"); assert.equal(f.calls.filter(c => c === "suspend").length, 1); assert.ok(f.calls.indexOf("suspend") < f.calls.lastIndexOf("getSubscription"));
});
test("suspension failure remains pending, never active, without capacity release", async () => {
  const f = fixture({ failSuspend: true }); await assert.rejects(activate(f)); assert.equal(f.sub.billingExemption.status, "pending_provider_action"); assert.equal(f.sub.maxUnits, 0); assert.equal(f.sub.billingExemption.reason, "Minha escola");
});
for (const [environment, linkEnvironment] of [["sandbox", "production"], ["production", "sandbox"]]) test(`environment conflict ${environment}/${linkEnvironment} is fail-closed and audited`, async () => {
  const f = fixture({ environment, linkEnvironment }); await assert.rejects(activate(f), /ENVIRONMENT_CONFLICT/); assert.deepEqual(f.calls, []); assert.equal(f.sub.billingExemption.status, "pending_provider_action"); assert.ok(f.audits.some(a => a.code === "EXEMPTION_PROVIDER_ENVIRONMENT_CONFLICT"));
});
for (const status of ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]) test(`${status} charge is preserved and cannot be forgiven`, async () => {
  const f = fixture({ payments: [payment(status)] }); await assert.rejects(activate(f, { policy: "forgive_selected", paymentIds: ["pay_fixture"] }), /NOT_FORGIVABLE/); assert.equal(f.payments[0].deleted, undefined); assert.equal(f.sub.billingExemption.status, "pending_provider_action");
});
for (const status of ["PENDING", "OVERDUE"]) {
  test(`${status} preserved by explicit policy`, async () => { const f = fixture({ payments: [payment(status)] }); await activate(f); assert.equal(f.payments[0].deleted, undefined); assert.equal(f.sub.billingExemption.status, "active"); assert.deepEqual(f.sub.billingExemption.preservedPayments, ["pay_fixture"]); });
  test(`${status} explicitly selected is removed and audited`, async () => { const f = fixture({ payments: [payment(status)] }); await activate(f, { policy: "forgive_selected", paymentIds: ["pay_fixture"] }); assert.equal(f.payments[0].deleted, true); assert.equal(f.sub.billingExemption.status, "active"); assert.ok(f.audits.some(a => a.action === "payment_removed")); });
}
test("unpaid charge without policy requires explicit decision", async () => { const f = fixture({ payments: [payment("OVERDUE")] }); await assert.rejects(f.service.runExemption(f.db, f.sub, "admin", { grant: grant() }, now), /DECISION_REQUIRED/); assert.equal(f.sub.billingExemption.status, "pending_provider_action"); });
test("foreign payment cannot be forgiven", async () => { const f = fixture({ payments: [{ ...payment("PENDING"), customer: "cus_other" }] }); await assert.rejects(activate(f), /SCOPE_CONFLICT/); assert.equal(f.payments[0].deleted, undefined); });
test("foreign subscription cannot be suspended", async () => { const f = fixture({ remote: { customer: "cus_other" } }); await assert.rejects(activate(f), /SCOPE_CONFLICT/); assert.ok(!f.calls.includes("suspend")); });
test("lost suspension response is reconciled on retry without second suspension", async () => { const f = fixture({ failSuspend: true, lostSuspendResponse: true }); await assert.rejects(activate(f)); await activate(f); assert.equal(f.calls.filter(c => c === "suspend").length, 1); assert.equal(f.sub.billingExemption.status, "active"); });
test("double activation is idempotent", async () => { const f = fixture(); await activate(f); const count = f.calls.length; assert.equal((await activate(f)).duplicate, true); assert.equal(f.calls.length, count); });
test("concurrent activation cannot enter a held lease", async () => { const f = fixture(); f.sub.billingExemption.leaseUntil = new Date(now.getTime() + 60000); await assert.rejects(activate(f), /OPERATION_IN_PROGRESS/); assert.deepEqual(f.calls, []); });
test("manual ending resumes with current UTC date and preserves capacity", async () => { const f = fixture(); await activate(f); const result = await f.service.runExemption(f.db, f.sub, "admin", { endReason: "Retomar cobrança" }, now); assert.equal(result.status, "ended"); assert.equal(result.resumeDueDate, "2026-11-04"); assert.equal(f.remote.status, "ACTIVE"); assert.equal(f.sub.maxUnits, 1); assert.deepEqual(f.calls.find(Array.isArray), ["resume", { value: 119.90, nextDueDate: "2026-11-04" }]); });
test("duplicate ending does not resume twice", async () => { const f = fixture(); await activate(f); await f.service.runExemption(f.db, f.sub, "admin", { endReason: "Retomar" }, now); await f.service.runExemption(f.db, f.sub, "admin", { endReason: "Retomar" }, now); assert.equal(f.calls.filter(Array.isArray).length, 1); });
test("failed resumption remains resumable and keeps verified access evidence", async () => { const f = fixture({ failResume: true }); await activate(f); await assert.rejects(f.service.runExemption(f.db, f.sub, "admin", { endReason: "Retomar" }, now)); assert.equal(f.sub.billingExemption.status, "resume_pending"); assert.ok(f.sub.billingExemption.activatedAt); await f.service.runExemption(f.db, f.sub, "admin", { reconcile: true }, now); assert.equal(f.sub.billingExemption.status, "ended"); });
test("finite exemption resumes at expiry, not on historical end date", async () => { const f = fixture(); await activate(f, preserve, { ...grant(), type: "period", endsAt: new Date("2026-11-04Z") }); await f.service.runExemption(f.db, f.sub, "job", { reconcile: true }, new Date("2026-11-10Z")); assert.equal(f.remote.nextDueDate, "2026-11-11"); assert.equal(f.sub.billingExemption.status, "ended"); });
test("future exemption is scheduled without early remote suspension", async () => { const f = fixture(); await activate(f, preserve, { ...grant(), startsAt: new Date("2026-12-01Z") }); assert.equal(f.sub.billingExemption.status, "scheduled"); assert.ok(!f.calls.includes("suspend")); });
test("ending a future schedule does not reactivate or advance existing billing", async () => {
  const f = fixture(); await activate(f, preserve, { ...grant(), startsAt: new Date("2026-12-01Z") });
  await f.service.runExemption(f.db, f.sub, "admin", { endReason: "Cancelar agenda" }, now);
  assert.equal(f.remote.nextDueDate, "2026-10-24"); assert.equal(f.sub.status, "past_due"); assert.equal(f.calls.filter(Array.isArray).length, 0);
});
test("indefinite exemption remains active without resumption date", async () => { const f = fixture(); await activate(f); assert.equal(f.sub.billingExemption.endsAt, null); assert.equal(f.sub.billingExemption.resumeDueDate, undefined); });
test("capacity never shrinks below existing authorization or actual linked units", () => { const f = fixture(); assert.equal(f.service.exemptionCapacity({ requestedMaxUnits: 1, maxUnits: 3 }, 2), 3); assert.equal(f.service.exemptionCapacity({ requestedMaxUnits: 1, maxUnits: 0 }, 4), 4); });
test("production mutation gates are respected", async () => { const f = fixture({ gateBlocked: true }); await assert.rejects(activate(f)); assert.ok(!f.calls.includes("suspend")); });
test("a paid charge is preserved during successful activation", async () => { const f = fixture({ payments: [payment("RECEIVED")] }); await activate(f); assert.equal(f.sub.billingExemption.status, "active"); assert.equal(f.payments[0].deleted, undefined); });
test("uncertain previous subscription creation prevents a local-only exemption", async () => { const f = fixture({ noLink: true, sub: { providerSubscriptionCreateUncertainAt: now } }); await assert.rejects(activate(f), /OPERATION_IN_PROGRESS/); assert.equal(f.sub.maxUnits, 0); });
test("lazy access reconciles a schedule even when its job did not run", async () => {
  const f = fixture(); await activate(f, preserve, { ...grant(), startsAt: new Date("2026-12-01Z") });
  const result = await f.service.reconcileExemptionOnAccess(f.db, f.sub, new Date("2026-12-02Z"));
  assert.equal(result.billingExemption.status, "active"); assert.equal(f.remote.status, "INACTIVE"); assert.equal(result.maxUnits, 1);
});
test("webhook environment mismatch cannot update another environment", async () => {
  const f = fixture(); const hooks = loadRoute("src/lib/billing-exemption-webhooks.ts", { "server-only": {} });
  const event = hooks.parseExemptionWebhook({ id: "evt_test", event: "SUBSCRIPTION_INACTIVATED", subscription: { id: "sub_fixture", customer: "cus_fixture" } });
  await assert.rejects(hooks.processExemptionWebhook(f.db, event, "production"), /LINK_CONFLICT/);
});
test("payment webhooks retain exempt capacity/status and reconcile a newly linked recurring charge", async () => {
  const f = fixture({ payments: [payment("OVERDUE")] }); await activate(f);
  const events = loadRoute("src/lib/billing-events.ts", { "server-only": {} });
  const event = { id: "evt_overdue", event: "PAYMENT_OVERDUE", payment: { ...payment("OVERDUE", "pay_recurring") } };
  assert.equal(await events.processAsaasPaymentWebhook(f.db, event, "sandbox"), "processed");
  assert.equal(await events.processAsaasPaymentWebhook(f.db, event, "sandbox"), "duplicate");
  assert.equal(f.sub.status, "active"); assert.equal(f.sub.maxUnits, 1);
});
test("future scheduled exemption does not suppress delinquency of existing obligations", async () => {
  const f = fixture({ sub: { status: "active" } }); await activate(f, preserve, { ...grant(), startsAt: new Date("2026-12-01Z") });
  const events = loadRoute("src/lib/billing-events.ts", { "server-only": {} });
  await events.processAsaasPaymentWebhook(f.db, { id: "evt_due", event: "PAYMENT_OVERDUE", payment: payment("OVERDUE") }, "sandbox");
  assert.equal(f.sub.status, "past_due");
});
test("preserved old obligation keeps its original amount after exempt capacity changes", async () => {
  const f = fixture({ payments: [payment("OVERDUE")] }); await activate(f); f.sub.maxUnits = 2;
  const events = loadRoute("src/lib/billing-events.ts", { "server-only": {} });
  await events.processAsaasPaymentWebhook(f.db, { id: "evt_old_paid", event: "PAYMENT_RECEIVED", payment: payment("RECEIVED") }, "sandbox");
  assert.equal(f.sub.maxUnits, 2); assert.equal(f.sub.status, "active");
});
test("audit never stores raw provider errors or user supplied credentials", async () => { const f = fixture({ failSuspend: true }); await assert.rejects(activate(f, preserve, { ...grant(), reason: "token=fixture-secret Minha escola" })); const audit = JSON.stringify(f.audits); assert.ok(!audit.includes("fixture-secret")); assert.ok(!audit.includes("secret raw provider error")); });
test("decision parser rejects silent forgiveness and invalid IDs", () => { const f = fixture(); assert.equal(f.service.parseExemptionDecision({ policy: "forgive_selected", paymentIds: [] }), null); assert.equal(f.service.parseExemptionDecision({ policy: "preserve", paymentIds: ["pay_x"] }), null); assert.deepEqual(f.service.parseExemptionDecision(preserve), preserve); });
test("late resumption retry while still inactive advances the date, never backdates a new charge", async () => {
  const f = fixture({ failResume: true }); await activate(f);
  await assert.rejects(f.service.runExemption(f.db, f.sub, "admin", { endReason: "Retomar" }, now));
  await f.service.runExemption(f.db, f.sub, "admin", { reconcile: true }, new Date("2026-11-10Z"));
  assert.equal(f.remote.nextDueDate, "2026-11-11");
});
test("retry after provider advanced its schedule never replays the successful due date", async () => {
  const f = fixture(); await activate(f);
  f.sub.billingExemption.status = "resume_pending"; f.sub.billingExemption.resumeDueDate = "2026-11-03";
  f.remote.status = "ACTIVE"; f.remote.nextDueDate = "2026-12-03";
  f.payments.push({ ...payment("PENDING"), dueDate: "2026-11-03" });
  await f.service.runExemption(f.db, f.sub, "admin", { reconcile: true }, new Date("2026-11-10Z"));
  assert.equal(f.calls.filter(Array.isArray).length, 0); assert.equal(f.sub.billingExemption.status, "ended");
});
test("new company with null exemption can activate without remote billing", async () => {
  const f = fixture({ noLink: true, sub: { billingExemption: null } }); await activate(f); assert.equal(f.sub.billingExemption.status, "active");
});
for (const name of ["checkout", "subscription", "customer", "reactivation", "cancellation"]) test(`${name} server handler blocks exemption before provider calls`, async () => {
  const f = fixture(); f.sub.billingExemption.status = "active";
  let remoteCalls = 0;
  const route = loadRoute(`src/app/api/company/billing/${name}/route.ts`, {
    ...f.mocks,
    "next/server": { NextResponse: { json: (body, init = {}) => ({ status: init.status ?? 200, body }) } },
    "@/lib/auth": { authenticateRequest: async () => ({ authenticated: true, auth: { role: "company_admin", companyId } }) },
    "@/lib/mongodb": { __esModule: true, default: Promise.resolve({ db: () => f.db }) },
    "@/lib/saas": { DB_NAME: "fixture" },
    "@/lib/billing-provider-links": { getBillingProviderLink: () => { remoteCalls++; throw Error("must not run"); } },
    "../customer/route": { POST: () => { remoteCalls++; throw Error("must not run"); } },
    "../subscription/route": { POST: () => { remoteCalls++; throw Error("must not run"); } },
  });
  const result = await route.POST({ json: async () => name === "cancellation" ? { reason: "other", comment: "Fixture reason" } : { requestedUnits: 1 }, headers: new Headers() });
  assert.equal(result.status, 409); assert.equal(result.body.code, "BILLING_EXEMPTION_PROTECTED"); assert.equal(remoteCalls, 0);
});
test("official subscription/deletion observations are idempotent and do not activate exemption", async () => {
  const f = fixture(); const hooks = loadRoute("src/lib/billing-exemption-webhooks.ts", { "server-only": {} });
  for (const name of ["SUBSCRIPTION_UPDATED", "SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED", "PAYMENT_DELETED"]) {
    const event = hooks.parseExemptionWebhook({ id: `evt_${name}`, event: name, subscription: { id: "sub_fixture", customer: "cus_fixture" }, payment: { id: "pay_fixture", customer: "cus_fixture", subscription: "sub_fixture" } });
    assert.ok(event); assert.equal(await hooks.processExemptionWebhook(f.db, event, "sandbox"), "processed"); assert.equal(await hooks.processExemptionWebhook(f.db, event, "sandbox"), "duplicate"); assert.equal(f.sub.billingExemption.status, "pending_provider_action");
  }
  assert.equal(hooks.parseExemptionWebhook({ id: "evt_x", event: "SUBSCRIPTION_PAUSED", subscription: { id: "sub_fixture" } }), null);
});
