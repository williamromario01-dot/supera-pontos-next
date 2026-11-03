import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Db, Document } from "mongodb";
import { getAsaasEnvironment } from "@/lib/asaas";
import { assertAsaasMutationAllowed } from "@/lib/asaas-production";
import { getAsaasSubscription, getAsaasPayment, listAllAsaasSubscriptionPayments,
  suspendAsaasSubscription, removeAsaasExemptedPayment, reactivateAsaasSubscription,
  type AsaasPayment } from "@/lib/asaas-subscriptions";
import { getPricingQuote } from "@/lib/plans";
import { activeSchoolFilter } from "@/lib/schools";
import { normalizeBillingExemption } from "@/lib/billing-exemption";
import { nextReactivationDueDate } from "@/lib/subscription-reactivation";
import { billingLinkBelongsToSubscription, legacyBillingSubscriptionReference } from "@/lib/billing-subscription-reference";

export class ExemptionError extends Error {
  constructor(public readonly code: string, public readonly status = 409) { super(code); }
}
export type ExemptionDecision = { policy: "preserve" | "forgive_selected"; paymentIds: string[] };
export function parseExemptionDecision(value: unknown): ExemptionDecision | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.policy !== "preserve" && v.policy !== "forgive_selected") return null;
  const ids = v.paymentIds ?? [];
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== "string" || !/^pay_[a-zA-Z0-9]+$/.test(id))) return null;
  if (v.policy === "preserve" && ids.length || v.policy === "forgive_selected" && !ids.length) return null;
  return { policy: v.policy, paymentIds: [...new Set(ids)] as string[] };
}

export function exemptionCapacity(sub: Document, actualUnits: number): number {
  const units = Math.max(Number(sub.requestedMaxUnits || 0), Number(sub.maxUnits || 0), actualUnits);
  if (!getPricingQuote(units)) throw new ExemptionError("EXEMPTION_CAPACITY_INVALID");
  return units;
}

export function exemptionResumeDate(now: Date): string {
  // Reuse the official resumption rule: tomorrow in UTC, never a historical due date.
  return nextReactivationDueDate(now);
}

function safeReason(value: unknown): string {
  return String(value ?? "").slice(0, 500).replace(/(password|senha|hash|cookie|token|secret|api.?key|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

/** No fallback between environments, including when a link exists only in the other environment. */
export async function exemptionLink(db: Db, sub: Document): Promise<Document | null> {
  const environment = getAsaasEnvironment();
  const links = await db.collection("billingProviderLinks").find({ provider: "asaas", internalSubscriptionId: sub._id }).toArray();
  if (links.length > 1 || links.some(l => !billingLinkBelongsToSubscription(sub, l, environment))) {
    throw new ExemptionError("EXEMPTION_PROVIDER_ENVIRONMENT_CONFLICT");
  }
  const link = links[0];
  if (link) return link;
  if (sub.providerSubscriptionId || sub.providerPaymentId) {
    if (environment !== "sandbox" || sub.providerEnvironment !== "sandbox") throw new ExemptionError("EXEMPTION_PROVIDER_ENVIRONMENT_CONFLICT");
    return { ...sub, environment, internalSubscriptionId: sub._id };
  }
  return null;
}

function assertRemote(sub: Document, link: Document, remote: Awaited<ReturnType<typeof getAsaasSubscription>>) {
  if (remote.id !== link.providerSubscriptionId || remote.customer !== link.providerCustomerId ||
    remote.cycle !== "MONTHLY") {
    throw new ExemptionError("EXEMPTION_REMOTE_SCOPE_CONFLICT");
  }
  const legacyReference = legacyBillingSubscriptionReference(sub, link, getAsaasEnvironment());
  if (remote.externalReference !== `subscription:${sub._id}` &&
    (legacyReference === undefined || remote.externalReference !== legacyReference)) {
    throw new ExemptionError("EXEMPTION_REMOTE_SCOPE_CONFLICT");
  }
}
function assertPayment(payment: AsaasPayment, link: Document) {
  if (payment.customer !== link.providerCustomerId || payment.subscription !== link.providerSubscriptionId) throw new ExemptionError("EXEMPTION_PAYMENT_SCOPE_CONFLICT");
}

export async function inspectExemptionProvider(db: Db, sub: Document) {
  const link = await exemptionLink(db, sub);
  if (!link?.providerSubscriptionId) {
    if (link?.providerPaymentId) throw new ExemptionError("EXEMPTION_ORPHAN_PAYMENT");
    return { state: "none", payments: [] };
  }
  const remote = await getAsaasSubscription(link.providerSubscriptionId);
  assertRemote(sub, link, remote);
  const payments = await listAllAsaasSubscriptionPayments(remote.id);
  payments.forEach(p => assertPayment(p, link));
  return { state: remote.status, value: remote.value, nextDueDate: remote.nextDueDate,
    payments: payments.map(p => ({ id: p.id, status: p.status, value: p.value, dueDate: p.dueDate, deleted: p.deleted === true })) };
}

type Grant = { type: string; startsAt: Date; endsAt: Date | null; months: number | null; reason: string };

export async function reconcileExemptionOnAccess(db: Db, sub: Document, now = new Date()): Promise<Document> {
  const exemption = sub.billingExemption;
  if (!exemption || !(
    exemption.status === "scheduled" && exemption.startsAt instanceof Date && exemption.startsAt <= now ||
    exemption.status === "active" && exemption.endsAt instanceof Date && exemption.endsAt < now ||
    exemption.status === "resume_pending"
  )) return sub;
  try { await runExemption(db, sub, "billing-exemption-access-reconciler", { reconcile: true }, now); }
  catch { /* The durable state and safe failure code are surfaced to the administrator. */ }
  return await db.collection("subscriptions").findOne({ _id: sub._id, companyId: sub.companyId }) ?? sub;
}

/** Durable saga: intent -> remote verification -> atomic local completion. Retry repeats verification. */
export async function runExemption(db: Db, sub: Document, actor: unknown, input: {
  grant?: Grant; decision?: ExemptionDecision; endReason?: string; reconcile?: boolean;
}, now = new Date()) {
  const subscriptions = db.collection("subscriptions");
  const old = normalizeBillingExemption(sub.billingExemption);
  const grant = input.grant ?? old;
  if (!grant) throw new ExemptionError("EXEMPTION_NOT_FOUND", 404);
  if (sub.cancelAtPeriodEnd === true || sub.status === "cancelled") throw new ExemptionError("EXEMPTION_CANCELLATION_REVIEW_REQUIRED");
  if (input.grant && grant.endsAt && grant.endsAt < now) throw new ExemptionError("EXEMPTION_PERIOD_EXPIRED", 400);
  const ending = Boolean(input.endReason || old?.status === "resume_pending" || (!input.grant && grant.endsAt && grant.endsAt < now));
  const cancelSchedule = ending && old?.status === "scheduled" && old.startsAt > now;
  let unchangedBilling = cancelSchedule;
  if (old?.status === "active" && input.grant && grant.startsAt > now) throw new ExemptionError("EXEMPTION_ACTIVE_START_CANNOT_MOVE_FORWARD");
  if (old?.status === "ended" && !input.grant) return { status: "ended", duplicate: true };
  if (!input.grant && old?.status === "active" && !ending && !input.reconcile) return { status: "active", duplicate: true };
  const decision = input.decision ?? sub.billingExemption?.decision;
  const key = createHash("sha256").update(JSON.stringify({ type: grant.type, startsAt: grant.startsAt, endsAt: grant.endsAt,
    reason: grant.reason, decision, ending })).digest("hex");
  if (sub.billingExemption?.operationKey === key && ["active", "scheduled", "ended"].includes(sub.billingExemption.status) && !input.reconcile) {
    return { status: sub.billingExemption.status, duplicate: true };
  }
  const token = randomUUID();
  const lock = await subscriptions.updateOne({ _id: sub._id, companyId: sub.companyId,
    updatedAt: sub.updatedAt,
    $or: [{ "billingExemption.leaseUntil": { $exists: false } }, { "billingExemption.leaseUntil": { $lte: now } }],
    "providerSubscriptionLinkLock.token": { $exists: false }, "providerCustomerLinkLock.token": { $exists: false },
    providerSubscriptionCreateUncertainAt: { $exists: false }, providerCustomerCreateUncertainAt: { $exists: false },
    "quantityChange.status": { $nin: ["preparing", "pending_payment", "reconciliation_required"] },
    "reactivation.status": { $nin: ["preparing", "pending_payment", "reconciliation_required"] },
    "cancellationOperation.status": { $nin: ["preparing", "reconciliation_required"] },
  }, { $set: { billingExemption: { ...sub.billingExemption, ...grant, reason: safeReason(grant.reason),
    decision: decision ?? null, operationKey: key, leaseToken: token, leaseUntil: new Date(now.getTime() + 15 * 60_000),
    status: ending ? "resume_pending" : "suspending" }, updatedAt: now } });
  if (lock.modifiedCount !== 1) throw new ExemptionError("EXEMPTION_OPERATION_IN_PROGRESS");
  const scope = { _id: sub._id, companyId: sub.companyId, "billingExemption.leaseToken": token };
  const audit = async (action: string, extra: Record<string, unknown> = {}) => {
    await db.collection("billingExemptionAudits").insertOne({ companyId: sub.companyId, subscriptionId: sub._id,
      superAdminId: actor, occurredAt: new Date(), action, operationKey: key, reason: safeReason(input.endReason ?? grant.reason), ...extra });
  };
  try {
    await audit(ending ? "resume_requested" : "activation_requested", {
      previousStatus: sub.status, previousExemptionStatus: old?.status ?? null,
      startsAt: grant.startsAt, endsAt: grant.endsAt, type: grant.type,
      policy: decision?.policy ?? null, selectedPaymentIds: decision?.paymentIds ?? [],
    });
    await subscriptions.updateOne(scope, { $set: {
      "billingExemption.type": grant.type, "billingExemption.startsAt": grant.startsAt,
      "billingExemption.endsAt": grant.endsAt, "billingExemption.months": grant.months,
      "billingExemption.reason": safeReason(grant.reason), "billingExemption.decision": decision ?? null,
      "billingExemption.operationKey": key,
    } });
    const link = await exemptionLink(db, sub);
    const units = exemptionCapacity(sub, await db.collection("schools").countDocuments(activeSchoolFilter(sub.companyId)));
    const quote = getPricingQuote(units)!;
    const state = { ...sub.billingExemption, ...grant, reason: safeReason(grant.reason), decision, operationKey: key,
      grantedBy: sub.billingExemption?.grantedBy ?? actor, grantedAt: sub.billingExemption?.grantedAt ?? now,
      updatedAt: now, status: ending ? "resume_pending" : "suspending", providerState: "none" };
    delete state.leaseToken; delete state.leaseUntil;
    await subscriptions.updateOne(scope, { $set: { billingExemption: { ...state, leaseToken: token, leaseUntil: new Date(now.getTime() + 15 * 60_000) } } });
    let resumeDueDate = sub.billingExemption?.resumeDueDate as string | undefined;
    if (link?.providerSubscriptionId) {
      let remote = await getAsaasSubscription(link.providerSubscriptionId);
      assertRemote(sub, link, remote);
      state.providerState = remote.status ?? "unknown";
      if (ending && remote.status === "ACTIVE" && !sub.billingExemption?.activatedAt && sub.billingExemption?.providerState !== "INACTIVE") unchangedBilling = true;
      if (ending && !unchangedBilling) {
        const previousAttempt = sub.billingExemption?.resumeDueDate;
        if (previousAttempt && remote.status === "ACTIVE" && remote.nextDueDate !== previousAttempt) {
          // Asaas may already have advanced its schedule after generating the first payment.
          // Never replay an old due date after an uncertain successful request.
          const generated = await listAllAsaasSubscriptionPayments(remote.id);
          generated.forEach(p => assertPayment(p, link));
          if (!generated.some(p => !p.deleted && p.dueDate === previousAttempt && Math.round(p.value * 100) === quote.totalMonthlyCents)) {
            throw new ExemptionError("EXEMPTION_RESUME_REVIEW_REQUIRED");
          }
          resumeDueDate = previousAttempt;
        } else {
        if (remote.status === "INACTIVE" && resumeDueDate && resumeDueDate < exemptionResumeDate(now)) resumeDueDate = exemptionResumeDate(now);
        resumeDueDate ??= exemptionResumeDate(now);
        // Persist before PUT; a lost response must not advance the due date on retry.
        await subscriptions.updateOne(scope, { $set: { "billingExemption.resumeDueDate": resumeDueDate } });
        if (remote.status !== "ACTIVE" || remote.nextDueDate !== resumeDueDate || Math.round(remote.value * 100) !== quote.totalMonthlyCents) {
          assertAsaasMutationAllowed(link.environment, "reactivation");
          await reactivateAsaasSubscription(remote.id, { value: quote.totalMonthlyCents / 100, nextDueDate: resumeDueDate });
        }
        remote = await getAsaasSubscription(remote.id); assertRemote(sub, link, remote);
        if (remote.status !== "ACTIVE" || remote.nextDueDate !== resumeDueDate || Math.round(remote.value * 100) !== quote.totalMonthlyCents) throw new ExemptionError("EXEMPTION_RESUME_UNCONFIRMED");
        }
        state.providerState = "ACTIVE";
      } else if (!ending && grant.startsAt <= now) {
        if (remote.status !== "INACTIVE") {
          if (remote.status !== "ACTIVE") throw new ExemptionError("EXEMPTION_REMOTE_STATUS_CONFLICT");
          assertAsaasMutationAllowed(link.environment, "subscription_changes");
          await suspendAsaasSubscription(remote.id);
        }
        remote = await getAsaasSubscription(remote.id); assertRemote(sub, link, remote);
        if (remote.status !== "INACTIVE") throw new ExemptionError("EXEMPTION_SUSPEND_UNCONFIRMED");
        state.providerState = "INACTIVE";
        await subscriptions.updateOne(scope, { $set: { "billingExemption.providerState": "INACTIVE" } });
        await audit("suspension_confirmed", { providerState: "INACTIVE" });
        const payments = await listAllAsaasSubscriptionPayments(remote.id);
        payments.forEach(p => assertPayment(p, link));
        const unpaid = payments.filter(p => !p.deleted && ["PENDING", "OVERDUE"].includes(p.status));
        if (unpaid.length && !decision) throw new ExemptionError("EXEMPTION_PAYMENT_DECISION_REQUIRED");
        for (const id of decision?.paymentIds ?? []) {
          const payment = await getAsaasPayment(id); assertPayment(payment, link);
          if (payment.deleted) continue;
          if (!["PENDING", "OVERDUE"].includes(payment.status)) throw new ExemptionError("EXEMPTION_PAYMENT_NOT_FORGIVABLE");
          await audit("payment_removal_requested", { paymentId: id, previousStatus: payment.status, value: payment.value });
          assertAsaasMutationAllowed(link.environment, "cancellation");
          await removeAsaasExemptedPayment(id);
          const verified = await getAsaasPayment(id); assertPayment(verified, link);
          if (!verified.deleted) throw new ExemptionError("EXEMPTION_PAYMENT_REMOVAL_UNCONFIRMED");
          await audit("payment_removed", { paymentId: id });
        }
        state.preservedPayments = unpaid.filter(p => !(decision?.paymentIds ?? []).includes(p.id)).map(p => p.id);
        state.preservedPaymentValues = Object.fromEntries(unpaid.filter(p => !(decision?.paymentIds ?? []).includes(p.id)).map(p => [p.id, Math.round(p.value * 100)]));
        // A concurrent external update must not be mistaken for a completed suspension.
        const verified = await getAsaasSubscription(remote.id); assertRemote(sub, link, verified);
        if (verified.status !== "INACTIVE") throw new ExemptionError("EXEMPTION_SUSPEND_UNCONFIRMED");
      }
    } else if (link?.providerPaymentId) throw new ExemptionError("EXEMPTION_ORPHAN_PAYMENT");
    const status = ending ? "ended" : grant.startsAt > now ? "scheduled" : "active";
    delete state.failureCode;
    const session = db.client.startSession();
    try { await session.withTransaction(async () => {
      const result = await subscriptions.updateOne(scope, { $set: { billingExemption: { ...state, status,
        providerAction: { required: false, reason: null, pendingPaymentDetected: false, remoteSubscriptionDetected: Boolean(link?.providerSubscriptionId) },
        ...(ending ? { endedAt: now, endedBy: actor, endReason: safeReason(input.endReason ?? "Fim do período"), resumeDueDate } : {}),
        reconciliationRequired: false,
        ...(status === "active" ? { activatedAt: now } : {}),
      }, ...(status === "active" ? { status: "active", maxUnits: units, requestedMaxUnits: units, pricePerUnitCents: quote.pricePerUnitCents, totalMonthlyCents: quote.totalMonthlyCents } : {}),
        ...(ending ? { status: unchangedBilling ? sub.status : link?.providerSubscriptionId ? "active" : "pending" } : {}), updatedAt: new Date() } }, { session });
      if (result.modifiedCount !== 1) throw new ExemptionError("EXEMPTION_OPERATION_IN_PROGRESS");
      if (status !== "scheduled" && !unchangedBilling) await db.collection("companies").updateOne({ _id: sub.companyId }, { $set: { status: ending && !link?.providerSubscriptionId ? "pending_payment" : "active", updatedAt: new Date() } }, { session });
      if (link?._id && !link.legacy) await db.collection("billingProviderLinks").updateOne({ _id: link._id, companyId: sub.companyId }, { $set: {
        exemptionReconciliationRequired: false, providerSubscriptionStatus: state.providerState,
        ...(decision?.paymentIds.includes(link.providerPaymentId) && !ending ? { providerPaymentStatus: "DELETED" } : {}),
      } }, { session });
      await db.collection("billingExemptionAudits").insertOne({ companyId: sub.companyId, subscriptionId: sub._id, superAdminId: actor,
        occurredAt: new Date(), action: status, operationKey: key, providerState: state.providerState, units, reason: safeReason(input.endReason ?? grant.reason) }, { session });
    }); } finally { await session.endSession(); }
    return { status, providerState: state.providerState, resumeDueDate, capacity: units };
  } catch (error) {
    const code = error instanceof ExemptionError ? error.code : "EXEMPTION_RECONCILIATION_REQUIRED";
    await subscriptions.updateOne(scope, { $set: { "billingExemption.status": ending ? "resume_pending" : "pending_provider_action",
      "billingExemption.reconciliationRequired": code === "EXEMPTION_RECONCILIATION_REQUIRED" || code.endsWith("_UNCONFIRMED"),
      "billingExemption.failureCode": code, updatedAt: new Date() }, $unset: { "billingExemption.leaseToken": "", "billingExemption.leaseUntil": "" } });
    await audit("reconciliation_required", { code });
    throw new ExemptionError(code, error instanceof ExemptionError ? error.status : 503);
  }
}
