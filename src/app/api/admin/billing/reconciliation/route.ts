import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";

export const dynamic = "force-dynamic";

function mask(value: unknown): string | null {
  return typeof value === "string" && value.length >= 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : null;
}

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "super_admin") return NextResponse.json({ error: "Acesso exclusivo do super administrador." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME);
  const subscriptions = await db.collection("subscriptions").find({ $or: [
    { providerCustomerCreateUncertainAt: { $exists: true } },
    { providerSubscriptionCreateUncertainAt: { $exists: true } },
    { "quantityChange.status": "reconciliation_required" },
    { "reactivation.status": "reconciliation_required" },
    { "cancellationOperation.status": "reconciliation_required" },
  ] }, { projection: { companyId: 1, providerCustomerCreateUncertainAt: 1, providerSubscriptionCreateUncertainAt: 1, quantityChange: 1, reactivation: 1, cancellationOperation: 1, updatedAt: 1 } }).limit(200).toArray();
  const ids = subscriptions.map((item) => item._id);
  const links = ids.length ? await db.collection("billingProviderLinks").find(
    { internalSubscriptionId: { $in: ids } },
    { projection: { provider: 1, environment: 1, internalSubscriptionId: 1, providerCustomerId: 1, providerSubscriptionId: 1, providerPaymentId: 1, updatedAt: 1 } },
  ).toArray() : [];
  return NextResponse.json({ readOnly: true, generatedAt: new Date(), items: subscriptions.map((subscription) => ({
    internalSubscriptionId: subscription._id.toString(), companyId: subscription.companyId?.toString(), updatedAt: subscription.updatedAt ?? null,
    operations: { customer: subscription.providerCustomerCreateUncertainAt ? "uncertain" : null, subscription: subscription.providerSubscriptionCreateUncertainAt ? "uncertain" : null, quantity: subscription.quantityChange?.status ?? null, reactivation: subscription.reactivation?.status ?? null, cancellation: subscription.cancellationOperation?.status ?? null },
    providerLinks: links.filter((link) => link.internalSubscriptionId.equals(subscription._id)).map((link) => ({ provider: link.provider, environment: link.environment, customerId: mask(link.providerCustomerId), subscriptionId: mask(link.providerSubscriptionId), paymentId: mask(link.providerPaymentId), updatedAt: link.updatedAt ?? null })),
  })) });
}
