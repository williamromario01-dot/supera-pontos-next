import "server-only";

import type { ClientSession, Db, ObjectId } from "mongodb";
import { MongoServerError } from "mongodb";
import { getPricingQuote } from "@/lib/plans";
import {
  canCompleteQuantityChange,
  hasCapacityForQuantityChange,
  matchesQuantityChangePayment,
} from "@/lib/quantity-change";
import { matchesReactivationPayment } from "@/lib/subscription-reactivation";
import { activeSchoolFilter } from "@/lib/schools";
import { PAST_DUE_GRACE_PERIOD_MS } from "@/lib/subscription-access";
import type { AsaasEnvironment } from "@/lib/asaas";

export const ASAAS_PAYMENT_EVENT_TYPES = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
] as const;

export type AsaasPaymentEventType = typeof ASAAS_PAYMENT_EVENT_TYPES[number];

export interface AsaasPaymentWebhookEvent {
  id: string;
  event: AsaasPaymentEventType;
  payment: {
    id: string;
    customer?: string;
    subscription?: string;
    status?: string;
    billingType?: string;
    value?: number;
  };
}

export async function assertBillingEventIndexes(db: Db): Promise<void> {
  await db.collection("billingEvents").updateMany(
    { provider: "asaas", providerEnvironment: { $exists: false } },
    { $set: { providerEnvironment: "sandbox" } },
  );
  await db.collection("billingEvents").createIndex(
    { provider: 1, providerEnvironment: 1, providerEventId: 1 },
    { unique: true, name: "uniq_provider_environment_event" },
  );
  const indexes = await db.collection("billingEvents").listIndexes().toArray();
  if (indexes.some((index) => index.name === "uniq_provider_event")) {
    await db.collection("billingEvents").dropIndex("uniq_provider_event");
  }
}

function isEventType(value: unknown): value is AsaasPaymentEventType {
  return typeof value === "string" &&
    (ASAAS_PAYMENT_EVENT_TYPES as readonly string[]).includes(value);
}

export function parseAsaasPaymentWebhookEvent(
  value: unknown,
): AsaasPaymentWebhookEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.id !== "string" || event.id.length < 3 || event.id.length > 150 ||
    !isEventType(event.event) ||
    !event.payment || typeof event.payment !== "object"
  ) return null;
  const payment = event.payment as Record<string, unknown>;
  if (
    typeof payment.id !== "string" || !payment.id.startsWith("pay_") ||
    payment.id.length > 100
  ) return null;
  return {
    id: event.id,
    event: event.event,
    payment: {
      id: payment.id,
      customer: typeof payment.customer === "string" ? payment.customer : undefined,
      subscription: typeof payment.subscription === "string"
        ? payment.subscription
        : undefined,
      status: typeof payment.status === "string" ? payment.status : undefined,
      billingType: typeof payment.billingType === "string"
        ? payment.billingType
        : undefined,
      value: typeof payment.value === "number" && Number.isFinite(payment.value)
        ? payment.value
        : undefined,
    },
  };
}

async function processInTransaction(
  db: Db,
  session: ClientSession,
  event: AsaasPaymentWebhookEvent,
  providerEnvironment: AsaasEnvironment,
  correlationId?: string,
): Promise<"processed" | "duplicate"> {
  const subscriptions = db.collection("subscriptions");
  const link = await db.collection("billingProviderLinks").findOne({
    provider: "asaas", environment: providerEnvironment,
    $or: [{ providerPaymentId: event.payment.id }, { quantityChangePaymentId: event.payment.id }, { reactivationPaymentId: event.payment.id }],
  }, { session });
  const subscription = link
    ? await subscriptions.findOne({ _id: link.internalSubscriptionId }, { session })
    : providerEnvironment === "sandbox"
      ? await subscriptions.findOne({ provider: "asaas", providerEnvironment: "sandbox", $or: [
        { providerPaymentId: event.payment.id },
        { "quantityChange.providerPaymentId": event.payment.id },
        { "reactivation.providerPaymentId": event.payment.id },
      ] }, { session })
      : null;
  if (!subscription) throw new Error("PAYMENT_NOT_LINKED");
  const providerCustomerId = link?.providerCustomerId ?? subscription.providerCustomerId;
  const providerSubscriptionId = link?.providerSubscriptionId ?? subscription.providerSubscriptionId;
  const quantityPaymentId = link?.quantityChangePaymentId ?? subscription.quantityChange?.providerPaymentId;
  const reactivationPaymentId = link?.reactivationPaymentId ?? subscription.reactivation?.providerPaymentId;
  if (link && subscription.quantityChange) subscription.quantityChange = {
    ...subscription.quantityChange,
    providerPaymentId: quantityPaymentId,
    providerCustomerId,
    providerSubscriptionId,
  };
  if (link && subscription.reactivation) subscription.reactivation = {
    ...subscription.reactivation,
    providerPaymentId: reactivationPaymentId,
    providerCustomerId,
    providerSubscriptionId,
  };
  if (
    event.payment.subscription !== providerSubscriptionId ||
    event.payment.customer !== providerCustomerId
  ) throw new Error("PAYMENT_LINK_CONFLICT");
  const quantityPayment = quantityPaymentId === event.payment.id;
  const quantityChangeMatches = quantityPayment && matchesQuantityChangePayment(
    subscription.quantityChange,
    event.payment,
  );
  if (quantityPayment && !quantityChangeMatches) {
    throw new Error("PAYMENT_LINK_CONFLICT");
  }
  const reactivationPayment = reactivationPaymentId === event.payment.id;
  const reactivationMatches = reactivationPayment && matchesReactivationPayment(
    subscription.reactivation,
    event.payment,
  );
  if (reactivationPayment && !reactivationMatches) {
    throw new Error("PAYMENT_LINK_CONFLICT");
  }
  const pricing = getPricingQuote(
    quantityPayment
      ? subscription.quantityChange.toUnits
      : reactivationPayment
        ? subscription.reactivation.requestedUnits
        : Number(subscription.maxUnits ?? 0) > 0
          ? subscription.maxUnits
          : subscription.requestedMaxUnits,
  );
  if (!pricing) throw new Error("SUBSCRIPTION_DATA_INVALID");
  if (
    !quantityPayment && !reactivationPayment &&
    (typeof event.payment.value !== "number" ||
      Math.round(event.payment.value * 100) !== pricing.totalMonthlyCents)
  ) throw new Error("PAYMENT_VALUE_CONFLICT");

  const confirmsPayment = event.event === "PAYMENT_CONFIRMED" ||
    event.event === "PAYMENT_RECEIVED";
  let activeUnitsForCompletion: number | null = null;
  let downgradeCapacitySafe = true;
  if (
    confirmsPayment &&
    quantityChangeMatches &&
    canCompleteQuantityChange(subscription.quantityChange) &&
    subscription.quantityChange.type === "downgrade"
  ) {
    activeUnitsForCompletion = await db.collection("schools").countDocuments(
      activeSchoolFilter(subscription.companyId as ObjectId),
      { session },
    );
    downgradeCapacitySafe = hasCapacityForQuantityChange(
      subscription.quantityChange,
      activeUnitsForCompletion,
    );
  }

  const now = new Date();
  await db.collection("billingEvents").insertOne({
    provider: "asaas",
    providerEnvironment,
    correlationId: correlationId ?? null,
    providerEventId: event.id,
    eventType: event.event,
    companyId: subscription.companyId,
    subscriptionId: subscription._id,
    providerPaymentId: event.payment.id,
    processedAt: now,
    createdAt: now,
  }, { session });

  const subscriptionSet: Record<string, unknown> = { updatedAt: now };
  const priorEvent = quantityPayment
    ? subscription.quantityChange?.providerPaymentLastEvent
    : reactivationPayment
      ? subscription.reactivation?.providerPaymentLastEvent
      : subscription.providerPaymentLastEvent;
  const staleOverdue = event.event === "PAYMENT_OVERDUE" &&
    (priorEvent === "PAYMENT_CONFIRMED" || priorEvent === "PAYMENT_RECEIVED");
  if (quantityPayment) {
    subscriptionSet["quantityChange.providerPaymentStatus"] =
      event.payment.status ?? event.event;
    subscriptionSet["quantityChange.providerPaymentLastEvent"] = event.event;
    subscriptionSet["quantityChange.providerPaymentUpdatedAt"] = now;
  } else if (reactivationPayment) {
    subscriptionSet["reactivation.providerPaymentStatus"] = event.payment.status ?? event.event;
    subscriptionSet["reactivation.providerPaymentLastEvent"] = event.event;
    subscriptionSet["reactivation.providerPaymentUpdatedAt"] = now;
  } else {
    subscriptionSet.providerPaymentStatus = event.payment.status ?? event.event;
    subscriptionSet.providerPaymentLastEvent = event.event;
    subscriptionSet.providerPaymentUpdatedAt = now;
  }
  if (staleOverdue) {
    if (quantityPayment) {
      subscriptionSet["quantityChange.providerPaymentStatus"] = subscription.quantityChange?.providerPaymentStatus;
      subscriptionSet["quantityChange.providerPaymentLastEvent"] = priorEvent;
    } else if (reactivationPayment) {
      subscriptionSet["reactivation.providerPaymentStatus"] = subscription.reactivation?.providerPaymentStatus;
      subscriptionSet["reactivation.providerPaymentLastEvent"] = priorEvent;
    } else {
      subscriptionSet.providerPaymentStatus = subscription.providerPaymentStatus;
      subscriptionSet.providerPaymentLastEvent = priorEvent;
    }
  }
  if (confirmsPayment) {
    if (!quantityPayment) subscriptionSet.status = "active";
    if (quantityPayment) {
      subscriptionSet["quantityChange.providerPaymentConfirmedAt"] = now;
    } else if (reactivationPayment) {
      subscriptionSet["reactivation.providerPaymentConfirmedAt"] = now;
    } else {
      subscriptionSet.providerPaymentConfirmedAt = now;
    }
    if (reactivationMatches) {
      subscriptionSet.cancelAtPeriodEnd = false;
      subscriptionSet.maxUnits = subscription.reactivation.requestedUnits;
      subscriptionSet.requestedMaxUnits = subscription.reactivation.requestedUnits;
      subscriptionSet["reactivation.status"] = "completed";
      subscriptionSet["reactivation.completedAt"] = now;
      subscriptionSet["reactivation.updatedAt"] = now;
      subscriptionSet.reactivatedAt = now;
      subscriptionSet.reactivatedByPaymentId = event.payment.id;
    } else if (
      quantityChangeMatches &&
      canCompleteQuantityChange(subscription.quantityChange) &&
      downgradeCapacitySafe
    ) {
      subscriptionSet.maxUnits = subscription.quantityChange.toUnits;
      subscriptionSet.requestedMaxUnits = subscription.quantityChange.toUnits;
      subscriptionSet["quantityChange.status"] = "completed";
      subscriptionSet["quantityChange.completedAt"] = now;
      subscriptionSet["quantityChange.updatedAt"] = now;
    } else if (
      quantityChangeMatches &&
      canCompleteQuantityChange(subscription.quantityChange) &&
      subscription.quantityChange.type === "downgrade" &&
      !downgradeCapacitySafe
    ) {
      subscriptionSet["quantityChange.status"] = "capacity_conflict";
      subscriptionSet["quantityChange.failureCode"] = "ACTIVE_UNITS_EXCEED_DOWNGRADE_TARGET";
      subscriptionSet["quantityChange.updatedAt"] = now;
    } else if (!quantityPayment && !reactivationPayment) {
      subscriptionSet.maxUnits = pricing.requestedUnits;
    }
  } else if (event.event === "PAYMENT_OVERDUE" && !staleOverdue) {
    if (reactivationMatches) {
      subscriptionSet["reactivation.status"] = "overdue";
      subscriptionSet["reactivation.updatedAt"] = now;
    } else if (!quantityPayment) {
      subscriptionSet.status = "past_due";
      const pastDueAt = subscription.pastDueAt instanceof Date
        ? subscription.pastDueAt
        : now;
      subscriptionSet.pastDueAt = pastDueAt;
      subscriptionSet.gracePeriodEndsAt = subscription.gracePeriodEndsAt instanceof Date
        ? subscription.gracePeriodEndsAt
        : new Date(pastDueAt.getTime() + PAST_DUE_GRACE_PERIOD_MS);
    }
    if (quantityChangeMatches && subscription.quantityChange.status === "pending_payment") {
      subscriptionSet["quantityChange.status"] = "overdue";
      subscriptionSet["quantityChange.updatedAt"] = now;
    }
  } else if (event.event === "PAYMENT_REFUNDED") {
    if (reactivationMatches) {
      subscriptionSet["reactivation.status"] = "refunded";
      subscriptionSet["reactivation.providerPaymentRefundedAt"] = now;
      subscriptionSet["reactivation.updatedAt"] = now;
    } else if (quantityPayment) {
      subscriptionSet["quantityChange.providerPaymentRefundedAt"] = now;
    } else {
      subscriptionSet.status = "past_due";
      subscriptionSet.providerPaymentRefundedAt = now;
      const pastDueAt = subscription.pastDueAt instanceof Date
        ? subscription.pastDueAt
        : now;
      subscriptionSet.pastDueAt = pastDueAt;
      subscriptionSet.gracePeriodEndsAt = subscription.gracePeriodEndsAt instanceof Date
        ? subscription.gracePeriodEndsAt
        : new Date(pastDueAt.getTime() + PAST_DUE_GRACE_PERIOD_MS);
    }
    if (quantityChangeMatches) {
      subscriptionSet["quantityChange.status"] = "refunded";
      subscriptionSet["quantityChange.updatedAt"] = now;
    }
  }
  const subscriptionUpdate: Record<string, unknown> = { $set: subscriptionSet };
  if (confirmsPayment && !quantityPayment && subscription.status === "past_due") {
    subscriptionSet.lastPastDueAt = subscription.pastDueAt ?? now;
    subscriptionSet.lastReactivatedAt = now;
    subscriptionUpdate.$unset = { pastDueAt: "", gracePeriodEndsAt: "" };
  }
  await subscriptions.updateOne(
    { _id: subscription._id },
    subscriptionUpdate,
    { session },
  );

  if (confirmsPayment) {
    const usedUnits = activeUnitsForCompletion ??
      await db.collection("schools").countDocuments(
        activeSchoolFilter(subscription.companyId as ObjectId),
        { session },
      );
    await subscriptions.updateOne(
      { _id: subscription._id },
      { $set: { unitCount: usedUnits } },
      { session },
    );
    if (!quantityPayment) {
      await db.collection("companies").updateOne(
        { _id: subscription.companyId as ObjectId },
        { $set: { status: "active", updatedAt: now } },
        { session },
      );
    }
  }
  return "processed";
}

export async function processAsaasPaymentWebhook(
  db: Db,
  event: AsaasPaymentWebhookEvent,
  providerEnvironment: AsaasEnvironment = "sandbox",
  correlationId?: string,
): Promise<"processed" | "duplicate"> {
  await assertBillingEventIndexes(db);
  const client = db.client;
  const session = client.startSession();
  let result: "processed" | "duplicate" = "processed";
  try {
    const existing = await db.collection("billingEvents").findOne({
      provider: "asaas",
      providerEnvironment,
      providerEventId: event.id,
    }, { projection: { _id: 1 } });
    if (existing) return "duplicate";
    try {
      await session.withTransaction(async () => {
        result = await processInTransaction(db, session, event, providerEnvironment, correlationId);
      });
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return "duplicate";
      }
      throw error;
    }
  } finally {
    await session.endSession();
  }
}
