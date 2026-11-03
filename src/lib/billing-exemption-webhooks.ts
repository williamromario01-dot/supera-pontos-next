import "server-only";
import type { Db, Document } from "mongodb";
import type { AsaasEnvironment } from "@/lib/asaas";

const EVENTS = ["PAYMENT_DELETED", "SUBSCRIPTION_UPDATED", "SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"];
export function parseExemptionWebhook(value: unknown): Document | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Document;
  if (typeof v.id !== "string" || v.id.length < 3 || v.id.length > 150 || !EVENTS.includes(v.event)) return null;
  const resource = v.event === "PAYMENT_DELETED" ? v.payment : v.subscription;
  if (!resource || typeof resource.id !== "string" || !resource.id.startsWith(v.event === "PAYMENT_DELETED" ? "pay_" : "sub_") ||
    typeof resource.customer !== "string" || !resource.customer.startsWith("cus_")) return null;
  if (v.event === "PAYMENT_DELETED" && (typeof resource.subscription !== "string" || !resource.subscription.startsWith("sub_"))) return null;
  return { id: v.id, event: v.event, resource: { id: resource.id, customer: resource.customer,
    subscription: resource.subscription, status: resource.status } };
}

/** Events are observations, not authorization to activate an exemption or forgive debt. */
export async function processExemptionWebhook(db: Db, event: Document, environment: AsaasEnvironment) {
  const payment = event.event === "PAYMENT_DELETED";
  const link = await db.collection("billingProviderLinks").findOne({ provider: "asaas", environment,
    providerSubscriptionId: payment ? event.resource.subscription : event.resource.id,
    providerCustomerId: event.resource.customer });
  if (!link) throw new Error("PAYMENT_LINK_CONFLICT");
  const receipts = db.collection("billingExemptionWebhookReceipts");
  await receipts.createIndex({ environment: 1, eventId: 1 }, { unique: true });
  const session = db.client.startSession();
  let duplicate = false;
  try {
    await session.withTransaction(async () => {
      if (await receipts.findOne({ environment, eventId: event.id }, { session })) { duplicate = true; return; }
      await receipts.insertOne({ environment, eventId: event.id, eventType: event.event,
        companyId: link.companyId, subscriptionId: link.internalSubscriptionId, receivedAt: new Date() }, { session });
      await db.collection("subscriptions").updateOne({ _id: link.internalSubscriptionId, companyId: link.companyId,
        "billingExemption.status": { $exists: true, $ne: "ended" } }, { $set: {
        "billingExemption.reconciliationRequired": true,
        "billingExemption.lastObservedEvent": event.event,
        "billingExemption.lastObservedAt": new Date(),
      } }, { session });
      await db.collection("billingProviderLinks").updateOne({ _id: link._id }, { $set: {
        exemptionReconciliationRequired: true, lastExemptionEvent: event.event,
        ...(payment && link.providerPaymentId === event.resource.id ? { providerPaymentStatus: "DELETED" } : {}),
      } }, { session });
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return "duplicate";
    throw error;
  } finally { await session.endSession(); }
  return duplicate ? "duplicate" : "processed";
}
