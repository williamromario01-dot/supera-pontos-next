import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Collection, Document, ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import { AsaasCustomerRequestError } from "@/lib/asaas";
import {
  findAsaasSubscriptions,
  listAsaasSubscriptionPayments,
  updateAsaasSubscriptionValue,
  type AsaasPayment,
  type AsaasSubscription,
} from "@/lib/asaas-subscriptions";
import { getPricingQuote, getQuantityChangeQuote } from "@/lib/plans";
import {
  isOpenQuantityChange,
  parseQuantityChangeRequest,
} from "@/lib/quantity-change";
import { activeSchoolFilter } from "@/lib/schools";
import { isOpenReactivation } from "@/lib/subscription-reactivation";
import { getAsaasEnvironment } from "@/lib/asaas";
import { assertAsaasMutationAllowed } from "@/lib/asaas-production";
import { getBillingProviderLink, upsertBillingProviderLink } from "@/lib/billing-provider-links";

export const dynamic = "force-dynamic";

const QUANTITY_CHANGE_LOCK_MS = 2 * 60 * 1000;

class QuantityChangeError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "QuantityChangeError";
  }
}

function providerId(value: unknown, prefix: string): string | null {
  return typeof value === "string" && value.startsWith(prefix) && value.length <= 100
    ? value
    : null;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function responseForPending(subscription: Document) {
  const change = subscription.quantityChange as Record<string, unknown>;
  const quote = getPricingQuote(change.toUnits);
  return {
    currentUnits: change.fromUnits,
    requestedUnits: change.toUnits,
    currentMonthlyValueCents: change.previousMonthlyValueCents,
    targetMonthlyValueCents: change.targetMonthlyValueCents,
    pricePerUnitCents: quote?.pricePerUnitCents ?? null,
    status: change.status,
    effectiveAfterPayment: true,
    asaasUpdatePerformed: false,
  };
}

function validateRemoteSubscription(
  remote: AsaasSubscription,
  subscription: Document,
  providerSubscriptionId: string,
  providerCustomerId: string,
): void {
  if (
    remote.id !== providerSubscriptionId ||
    remote.customer !== providerCustomerId ||
    remote.externalReference !== `subscription:${subscription._id.toString()}` ||
    remote.status !== "ACTIVE" ||
    remote.cycle !== "MONTHLY" ||
    (remote.billingType !== "PIX" && remote.billingType !== "BOLETO")
  ) throw new QuantityChangeError("PROVIDER_SUBSCRIPTION_CONFLICT", 409);
}

function matchingPendingPayment(
  payments: AsaasPayment[],
  remote: AsaasSubscription,
  providerSubscriptionId: string,
  providerCustomerId: string,
  targetMonthlyValueCents: number,
): AsaasPayment | null {
  const compatible = payments.filter((payment) =>
    payment.subscription === providerSubscriptionId &&
    payment.customer === providerCustomerId &&
    payment.status === "PENDING" &&
    cents(payment.value) === targetMonthlyValueCents &&
    payment.billingType === remote.billingType &&
    /^\d{4}-\d{2}-\d{2}$/.test(payment.dueDate) &&
    payment.dueDate < remote.nextDueDate
  );
  if (compatible.length > 1) {
    throw new QuantityChangeError("MULTIPLE_COMPATIBLE_PENDING_PAYMENTS", 409);
  }
  return compatible[0] ?? null;
}

async function readRemoteState(
  subscription: Document,
  providerSubscriptionId: string,
  providerCustomerId: string,
  currentMonthlyValueCents: number,
  targetMonthlyValueCents: number,
) {
  const compatibleSubscriptions = await findAsaasSubscriptions(
    `subscription:${subscription._id.toString()}`,
    providerCustomerId,
  );
  if (
    compatibleSubscriptions.length !== 1 ||
    compatibleSubscriptions[0].id !== providerSubscriptionId
  ) throw new QuantityChangeError("PROVIDER_SUBSCRIPTION_CONFLICT", 409);
  const remote = compatibleSubscriptions[0];
  validateRemoteSubscription(
    remote,
    subscription,
    providerSubscriptionId,
    providerCustomerId,
  );
  const payments = await listAsaasSubscriptionPayments(providerSubscriptionId);
  const remoteValueCents = cents(remote.value);
  if (
    remoteValueCents !== currentMonthlyValueCents &&
    remoteValueCents !== targetMonthlyValueCents
  ) throw new QuantityChangeError("PROVIDER_VALUE_CONFLICT", 409);
  const expectedPendingValueCents = remoteValueCents === targetMonthlyValueCents
    ? targetMonthlyValueCents
    : currentMonthlyValueCents;
  const payment = matchingPendingPayment(
    payments,
    remote,
    providerSubscriptionId,
    providerCustomerId,
    expectedPendingValueCents,
  );
  if (!payment) {
    throw new QuantityChangeError("PROVIDER_PENDING_PAYMENT_CONFLICT", 409);
  }
  return {
    remote,
    payment,
    ready: remoteValueCents === targetMonthlyValueCents,
    canUpdate: remoteValueCents === currentMonthlyValueCents,
  };
}

async function markFailed(
  subscriptions: Collection<Document>,
  subscriptionId: ObjectId,
  lockToken: string,
  status: "failed" | "reconciliation_required",
  code: string,
) {
  await subscriptions.updateOne(
    {
      _id: subscriptionId,
      "quantityChange.lockToken": lockToken,
      "quantityChange.status": "preparing",
    },
    {
      $set: {
        "quantityChange.status": status,
        "quantityChange.failureCode": code,
        "quantityChange.updatedAt": new Date(),
      },
      $unset: {
        "quantityChange.lockToken": "",
        "quantityChange.lockExpiresAt": "",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  let subscriptions: Collection<Document> | null = null;
  let subscriptionId: ObjectId | null = null;
  let lockToken: string | null = null;
  try {
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const { auth } = authResult;
    if (auth.role !== "company_admin" || !auth.companyId) {
      return NextResponse.json(
        { error: "Acesso exclusivo do responsável empresarial." },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
    }
    const requestedUnits = parseQuantityChangeRequest(body);
    if (requestedUnits === null) {
      return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
    }
    const requestedQuote = getPricingQuote(requestedUnits);
    if (!requestedQuote) {
      return NextResponse.json({ error: "Quantidade inválida." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const environment = getAsaasEnvironment();
    subscriptions = db.collection("subscriptions");
    const [company, subscription, activeSchoolCount] = await Promise.all([
      db.collection("companies").findOne({ _id: auth.companyId }),
      subscriptions.findOne(
        { companyId: auth.companyId },
        { sort: { createdAt: -1 } },
      ),
      db.collection("schools").countDocuments(activeSchoolFilter(auth.companyId)),
    ]);
    if (!company || company.status !== "active") {
      throw new QuantityChangeError("COMPANY_NOT_ACTIVE", 403);
    }
    if (!subscription || subscription.status !== "active") {
      throw new QuantityChangeError("SUBSCRIPTION_NOT_ACTIVE", 403);
    }
    if (subscription.cancelAtPeriodEnd === true) {
      throw new QuantityChangeError("CANCELLATION_SCHEDULED", 409);
    }
    if (
      subscription.cancellationOperation?.status === "preparing" ||
      subscription.cancellationOperation?.status === "reconciliation_required"
    ) {
      throw new QuantityChangeError("CANCELLATION_IN_PROGRESS", 409);
    }
    if (isOpenReactivation(subscription.reactivation)) {
      throw new QuantityChangeError("REACTIVATION_IN_PROGRESS", 409);
    }
    const currentUnits = Number(subscription.maxUnits);
    const currentQuote = getPricingQuote(currentUnits);
    if (!currentQuote || !Number.isSafeInteger(subscription.unitCount)) {
      throw new QuantityChangeError("SUBSCRIPTION_DATA_INVALID", 409);
    }
    if (requestedQuote.requestedUnits < activeSchoolCount) {
      return NextResponse.json(
        {
          error: `Para reduzir seu plano para ${requestedQuote.requestedUnits} unidade${requestedQuote.requestedUnits === 1 ? "" : "s"}, primeiro reduza a quantidade de unidades ativas da empresa para no máximo ${requestedQuote.requestedUnits}.`,
          code: "DOWNGRADE_REQUIRES_UNIT_REDUCTION",
        },
        { status: 409 },
      );
    }
    if (requestedQuote.requestedUnits === currentUnits) {
      return NextResponse.json({
        currentUnits,
        requestedUnits: currentUnits,
        currentMonthlyValueCents: currentQuote.totalMonthlyCents,
        targetMonthlyValueCents: currentQuote.totalMonthlyCents,
        pricePerUnitCents: currentQuote.pricePerUnitCents,
        status: "unchanged",
        effectiveAfterPayment: false,
        asaasUpdatePerformed: false,
      });
    }
    const changeType = requestedQuote.requestedUnits > currentUnits
      ? "upgrade"
      : "downgrade";

    const existingChange = subscription.quantityChange;
    if (isOpenQuantityChange(existingChange)) {
      const change = existingChange as Record<string, unknown>;
      if (
        change.type === changeType &&
        change.status === "pending_payment" &&
        change.fromUnits === currentUnits &&
        change.toUnits === requestedQuote.requestedUnits
      ) return NextResponse.json(responseForPending(subscription));
      const expiredPreparation = change.status === "preparing" &&
        change.lockExpiresAt instanceof Date && change.lockExpiresAt <= new Date();
      const recoverable = change.type === changeType &&
        change.fromUnits === currentUnits &&
        change.toUnits === requestedQuote.requestedUnits &&
        (change.status === "reconciliation_required" || expiredPreparation);
      if (!recoverable) {
        throw new QuantityChangeError("QUANTITY_CHANGE_IN_PROGRESS", 409);
      }
    }

    const link = await getBillingProviderLink(db, subscription, environment);
    const providerSubscriptionId = providerId(link?.providerSubscriptionId, "sub_");
    const providerCustomerId = providerId(link?.providerCustomerId, "cus_");
    if (!providerSubscriptionId || !providerCustomerId) {
      throw new QuantityChangeError("PROVIDER_LINK_INVALID", 409);
    }
    assertAsaasMutationAllowed(environment, "subscription_changes");
    const quote = getQuantityChangeQuote(
      currentUnits,
      requestedQuote.requestedUnits,
      activeSchoolCount,
    );
    if (!quote || quote.changeType !== changeType) {
      throw new QuantityChangeError("QUANTITY_CHANGE_INVALID", 409);
    }

    subscriptionId = subscription._id;
    lockToken = randomUUID();
    const now = new Date();
    const lockResult = await subscriptions.updateOne(
      {
        _id: subscription._id,
        companyId: auth.companyId,
        status: "active",
        cancelAtPeriodEnd: { $ne: true },
        "cancellationOperation.status": { $nin: ["preparing", "reconciliation_required"] },
        "reactivation.status": { $nin: ["preparing", "pending_payment", "reconciliation_required"] },
        maxUnits: currentUnits,
        $or: [
          { quantityChange: { $exists: false } },
          { "quantityChange.status": { $in: ["completed", "refunded", "failed"] } },
          { "quantityChange.status": "reconciliation_required" },
          {
            "quantityChange.status": "preparing",
            "quantityChange.lockExpiresAt": { $lte: now },
          },
        ],
      },
      {
        $set: {
          quantityChange: {
            type: changeType,
            status: "preparing",
            fromUnits: currentUnits,
            toUnits: quote.requestedUnits,
            previousMonthlyValueCents: currentQuote.totalMonthlyCents,
            targetMonthlyValueCents: quote.totalMonthlyCents,
            ...(environment === "sandbox" ? { providerSubscriptionId, providerCustomerId } : {}),
            lockToken,
            lockExpiresAt: new Date(now.getTime() + QUANTITY_CHANGE_LOCK_MS),
            requestedAt: now,
            updatedAt: now,
          },
          updatedAt: now,
        },
      },
    );
    if (lockResult.modifiedCount !== 1) {
      throw new QuantityChangeError("QUANTITY_CHANGE_IN_PROGRESS", 409);
    }

    let snapshot;
    try {
      snapshot = await readRemoteState(
        subscription,
        providerSubscriptionId,
        providerCustomerId,
        currentQuote.totalMonthlyCents,
        quote.totalMonthlyCents,
      );
    } catch (error) {
      if (!(error instanceof AsaasCustomerRequestError) || !error.inconclusive) throw error;
      snapshot = await readRemoteState(
        subscription,
        providerSubscriptionId,
        providerCustomerId,
        currentQuote.totalMonthlyCents,
        quote.totalMonthlyCents,
      );
    }

    let asaasUpdatePerformed = false;
    if (!snapshot.ready) {
      if (!snapshot.canUpdate) {
        throw new QuantityChangeError("PROVIDER_STATE_NOT_RECONCILED", 409);
      }
      try {
        await updateAsaasSubscriptionValue(
          providerSubscriptionId,
          quote.totalMonthlyCents / 100,
        );
        asaasUpdatePerformed = true;
      } catch (error) {
        if (!(error instanceof AsaasCustomerRequestError) || !error.inconclusive) throw error;
      }
      snapshot = await readRemoteState(
        subscription,
        providerSubscriptionId,
        providerCustomerId,
        currentQuote.totalMonthlyCents,
        quote.totalMonthlyCents,
      );
    }
    if (!snapshot.ready || !snapshot.payment) {
      throw new QuantityChangeError("PROVIDER_STATE_NOT_RECONCILED", 409);
    }

    const completedAt = new Date();
    const persisted = await subscriptions.updateOne(
      {
        _id: subscription._id,
        companyId: auth.companyId,
        maxUnits: currentUnits,
        "quantityChange.status": "preparing",
        "quantityChange.lockToken": lockToken,
      },
      {
        $set: {
          requestedMaxUnits: quote.requestedUnits,
          "quantityChange.status": "pending_payment",
          "quantityChange.providerPaymentId": snapshot.payment.id,
          "quantityChange.providerPaymentDueDate": snapshot.payment.dueDate,
          "quantityChange.updatedAt": completedAt,
          updatedAt: completedAt,
        },
        $unset: {
          "quantityChange.lockToken": "",
          "quantityChange.lockExpiresAt": "",
          "quantityChange.failureCode": "",
        },
      },
    );
    if (persisted.modifiedCount !== 1) {
      throw new QuantityChangeError("QUANTITY_CHANGE_PERSISTENCE_CONFLICT", 409);
    }
    if (environment === "production") {
      await upsertBillingProviderLink(db, subscription, environment, {
        providerCustomerId,
        providerSubscriptionId,
        quantityChangePaymentId: snapshot.payment.id,
      });
    }

    return NextResponse.json({
      currentUnits,
      requestedUnits: quote.requestedUnits,
      currentMonthlyValueCents: currentQuote.totalMonthlyCents,
      targetMonthlyValueCents: quote.totalMonthlyCents,
      pricePerUnitCents: quote.pricePerUnitCents,
      status: "pending_payment",
      effectiveAfterPayment: true,
      asaasUpdatePerformed,
    });
  } catch (error) {
    const code = error instanceof QuantityChangeError
      ? error.code
      : error instanceof AsaasCustomerRequestError
        ? error.code
        : "QUANTITY_CHANGE_FAILED";
    if (subscriptions && subscriptionId && lockToken) {
      const inconclusive = error instanceof AsaasCustomerRequestError && error.inconclusive;
      await markFailed(
        subscriptions,
        subscriptionId,
        lockToken,
        inconclusive ? "reconciliation_required" : "failed",
        code,
      ).catch(() => undefined);
    }
    if (error instanceof QuantityChangeError) {
      return NextResponse.json({ error: "Mudança de quantidade não disponível.", code }, { status: error.status });
    }
    if (error instanceof AsaasCustomerRequestError) {
      return NextResponse.json(
        { error: "Não foi possível reconciliar a assinatura no provedor.", code },
        { status: error.inconclusive ? 503 : 502 },
      );
    }
    console.error("Falha ao solicitar mudança de quantidade:", { code });
    return NextResponse.json({ error: "Falha ao solicitar mudança de quantidade." }, { status: 500 });
  }
}
