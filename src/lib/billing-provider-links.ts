import "server-only";

import type { Collection, Db, Document, ObjectId } from "mongodb";
import type { AsaasEnvironment } from "@/lib/asaas";

export type BillingProviderLink = Document & {
  provider: "asaas";
  environment: AsaasEnvironment;
  companyId: ObjectId;
  internalSubscriptionId: ObjectId;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerPaymentId?: string;
};

export async function ensureBillingProviderLinkIndexes(db: Db): Promise<void> {
  const links = db.collection("billingProviderLinks");
  await Promise.all([
    links.createIndex(
      { provider: 1, environment: 1, internalSubscriptionId: 1 },
      { unique: true, name: "uniq_provider_environment_subscription" },
    ),
    links.createIndex(
      { provider: 1, environment: 1, providerCustomerId: 1 },
      { unique: true, sparse: true, name: "uniq_provider_environment_customer" },
    ),
    links.createIndex(
      { provider: 1, environment: 1, providerSubscriptionId: 1 },
      { unique: true, sparse: true, name: "uniq_provider_environment_remote_subscription" },
    ),
    links.createIndex(
      { provider: 1, environment: 1, providerPaymentId: 1 },
      { unique: true, sparse: true, name: "uniq_provider_environment_payment" },
    ),
  ]);
}

export async function getBillingProviderLink(
  db: Db,
  subscription: Document,
  environment: AsaasEnvironment,
): Promise<BillingProviderLink | null> {
  await ensureBillingProviderLinkIndexes(db);
  const found = await db.collection<BillingProviderLink>("billingProviderLinks").findOne({
    provider: "asaas",
    environment,
    internalSubscriptionId: subscription._id,
  });
  if (found) return found;
  // Compatibility is intentionally one-way: legacy fields are Sandbox-only.
  if (environment !== "sandbox" || subscription.providerEnvironment !== "sandbox") return null;
  return {
    provider: "asaas",
    environment: "sandbox",
    companyId: subscription.companyId,
    internalSubscriptionId: subscription._id,
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId,
    providerPaymentId: subscription.providerPaymentId,
    legacy: true,
  };
}

export function links(db: Db): Collection<BillingProviderLink> {
  return db.collection<BillingProviderLink>("billingProviderLinks");
}

export async function upsertBillingProviderLink(
  db: Db,
  subscription: Document,
  environment: AsaasEnvironment,
  fields: Partial<BillingProviderLink>,
): Promise<void> {
  await ensureBillingProviderLinkIndexes(db);
  const now = new Date();
  await links(db).updateOne(
    { provider: "asaas", environment, internalSubscriptionId: subscription._id },
    {
      $set: { ...fields, companyId: subscription.companyId, updatedAt: now },
      $setOnInsert: { provider: "asaas", environment, internalSubscriptionId: subscription._id, createdAt: now },
    },
    { upsert: true },
  );
}
