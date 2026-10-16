import "server-only";

import type { ClientSession, Db, Document, ObjectId } from "mongodb";
import { MongoServerError } from "mongodb";
import { getPricingQuote } from "@/lib/plans";
import {
  canCompleteQuantityChange,
  hasCapacityForQuantityChange,
  matchesQuantityChangePayment,
} from "@/lib/quantity-change";
import { activeSchoolFilter } from "@/lib/schools";

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
  let indexes;
  try {
    indexes = await db.collection("billingEvents").listIndexes().toArray();
  } catch {
    throw new Error("BILLING_EVENT_INDEX_NOT_CONFIGURED");
  }
  const index = indexes.find((item) => item.name === "uniq_provider_event");
  const keys = index?.key ? Object.keys(index.key) : [];
  if (
    index?.unique !== true ||
    keys.length !== 2 || keys[0] !== "provider" || keys[1] !== "providerEventId" ||
    index.key?.provider !== 1 || index.key?.providerEventId !== 1
  ) throw new Error("BILLING_EVENT_INDEX_NOT_CONFIGURED");
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
): Promise<"processed" | "duplicate"> {
  const subscriptions = db.collection("subscriptions");
  const subscription = await subscriptions.findOne(
    {
      provider: "asaas",
      $or: [
        { providerPaymentId: event.payment.id },
        { "quantityChange.providerPaymentId": event.payment.id },
      ],
    },
    { session },
  );
  if (!subscription) throw new Error("PAYMENT_NOT_LINKED");
  if (
    subscription.providerEnvironment !== "sandbox" ||
    (event.payment.subscription &&
      event.payment.subscription !== subscription.providerSubscriptionId) ||
    (event.payment.customer &&
      event.payment.customer !== subscription.providerCustomerId)
  ) throw new Error("PAYMENT_LINK_CONFLICT");
  const quantityPayment = subscription.quantityChange?.providerPaymentId === event.payment.id;
  const quantityChangeMatches = quantityPayment && matchesQuantityChangePayment(
    subscription.quantityChange,
    event.payment,
  );
  if (quantityPayment && !quantityChangeMatches) {
    throw new Error("PAYMENT_LINK_CONFLICT");
  }
  const pricing = getPricingQuote(
    quantityPayment ? subscription.quantityChange.toUnits : subscription.maxUnits,
  );
  if (!pricing) throw new Error("SUBSCRIPTION_DATA_INVALID");
  if (
    !quantityPayment && event.payment.value !== undefined &&
    Math.round(event.payment.value * 100) !== pricing.totalMonthlyCents
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
    providerEventId: event.id,
    eventType: event.event,
    companyId: subscription.companyId,
    subscriptionId: subscription._id,
    providerPaymentId: event.payment.id,
    processedAt: now,
    createdAt: now,
  }, { session });

  const subscriptionSet: Record<string, unknown> = { updatedAt: now };
  if (quantityPayment) {
    subscriptionSet["quantityChange.providerPaymentStatus"] =
      event.payment.status ?? event.event;
    subscriptionSet["quantityChange.providerPaymentLastEvent"] = event.event;
    subscriptionSet["quantityChange.providerPaymentUpdatedAt"] = now;
  } else {
    subscriptionSet.providerPaymentStatus = event.payment.status ?? event.event;
    subscriptionSet.providerPaymentLastEvent = event.event;
    subscriptionSet.providerPaymentUpdatedAt = now;
  }
  if (confirmsPayment) {
    subscriptionSet.status = "active";
    if (quantityPayment) {
      subscriptionSet["quantityChange.providerPaymentConfirmedAt"] = now;
    } else {
      subscriptionSet.providerPaymentConfirmedAt = now;
    }
    if (
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
    } else if (!quantityPayment) {
      subscriptionSet.maxUnits = pricing.requestedUnits;
    }
  } else if (event.event === "PAYMENT_OVERDUE") {
    subscriptionSet.status = "past_due";
    if (quantityChangeMatches && subscription.quantityChange.status === "pending_payment") {
      subscriptionSet["quantityChange.status"] = "overdue";
      subscriptionSet["quantityChange.updatedAt"] = now;
    }
  } else if (event.event === "PAYMENT_REFUNDED") {
    subscriptionSet.status = "past_due";
    if (quantityPayment) {
      subscriptionSet["quantityChange.providerPaymentRefundedAt"] = now;
    } else {
      subscriptionSet.providerPaymentRefundedAt = now;
    }
    if (quantityChangeMatches) {
      subscriptionSet["quantityChange.status"] = "refunded";
      subscriptionSet["quantityChange.updatedAt"] = now;
    }
  }
  await subscriptions.updateOne(
    { _id: subscription._id },
    { $set: subscriptionSet },
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
    await db.collection("companies").updateOne(
      { _id: subscription.companyId as ObjectId },
      { $set: { status: "active", updatedAt: now } },
      { session },
    );
  }
  return "processed";
}

export async function processAsaasPaymentWebhook(
  db: Db,
  event: AsaasPaymentWebhookEvent,
): Promise<"processed" | "duplicate"> {
  await assertBillingEventIndexes(db);
  const client = db.client;
  const session = client.startSession();
  let result: "processed" | "duplicate" = "processed";
  try {
    const existing = await db.collection("billingEvents").findOne({
      provider: "asaas",
      providerEventId: event.id,
    }, { projection: { _id: 1 } });
    if (existing) return "duplicate";
    try {
      await session.withTransaction(async () => {
        result = await processInTransaction(db, session, event);
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
