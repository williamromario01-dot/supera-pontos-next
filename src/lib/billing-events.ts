import "server-only";

import type { ClientSession, Db, Document, ObjectId } from "mongodb";
import { MongoServerError } from "mongodb";
import { getPricingQuote } from "@/lib/plans";

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
    { provider: "asaas", providerPaymentId: event.payment.id },
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
  const pricing = getPricingQuote(subscription.requestedMaxUnits);
  if (!pricing) throw new Error("SUBSCRIPTION_DATA_INVALID");
  if (
    event.payment.value !== undefined &&
    Math.round(event.payment.value * 100) !== pricing.totalMonthlyCents
  ) throw new Error("PAYMENT_VALUE_CONFLICT");

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

  const subscriptionSet: Record<string, unknown> = {
    providerPaymentStatus: event.payment.status ?? event.event,
    providerPaymentLastEvent: event.event,
    providerPaymentUpdatedAt: now,
    updatedAt: now,
  };
  if (event.event === "PAYMENT_CONFIRMED" || event.event === "PAYMENT_RECEIVED") {
    subscriptionSet.status = "active";
    subscriptionSet.maxUnits = pricing.requestedUnits;
    subscriptionSet.providerPaymentConfirmedAt = now;
  } else if (event.event === "PAYMENT_OVERDUE") {
    subscriptionSet.status = "past_due";
  } else if (event.event === "PAYMENT_REFUNDED") {
    subscriptionSet.status = "past_due";
    subscriptionSet.providerPaymentRefundedAt = now;
  }
  await subscriptions.updateOne(
    { _id: subscription._id },
    { $set: subscriptionSet },
    { session },
  );

  if (event.event === "PAYMENT_CONFIRMED" || event.event === "PAYMENT_RECEIVED") {
    const usedUnits = await db.collection("schools").countDocuments(
      { companyId: subscription.companyId },
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
