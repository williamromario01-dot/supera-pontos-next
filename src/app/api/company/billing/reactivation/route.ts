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
  reactivateAsaasSubscription,
  type AsaasPayment,
  type AsaasSubscription,
} from "@/lib/asaas-subscriptions";
import { getCancellationAccessState } from "@/lib/subscription-cancellation";
import { getPricingQuote } from "@/lib/plans";
import { isOpenQuantityChange } from "@/lib/quantity-change";
import {
  isOpenReactivation,
  nextReactivationDueDate,
  parseReactivationRequest,
} from "@/lib/subscription-reactivation";
import { activeSchoolFilter } from "@/lib/schools";
import { getAsaasEnvironment } from "@/lib/asaas";
import { assertAsaasMutationAllowed } from "@/lib/asaas-production";
import { getBillingProviderLink, upsertBillingProviderLink } from "@/lib/billing-provider-links";

export const dynamic = "force-dynamic";
const REACTIVATION_LOCK_MS = 2 * 60 * 1000;

class ReactivationError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "ReactivationError";
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

function validateRemote(
  remote: AsaasSubscription,
  subscription: Document,
  providerSubscriptionId: string,
  providerCustomerId: string,
) {
  if (
    remote.id !== providerSubscriptionId ||
    remote.customer !== providerCustomerId ||
    remote.externalReference !== `subscription:${subscription._id.toString()}` ||
    remote.cycle !== "MONTHLY" ||
    (remote.billingType !== "PIX" && remote.billingType !== "BOLETO") ||
    !["ACTIVE", "INACTIVE", "EXPIRED"].includes(remote.status ?? "")
  ) throw new ReactivationError("PROVIDER_SUBSCRIPTION_CONFLICT", 409);
}

function matchingPendingPayment(
  payments: AsaasPayment[],
  remote: AsaasSubscription,
  providerSubscriptionId: string,
  providerCustomerId: string,
  targetMonthlyValueCents: number,
  nextDueDate: string,
): AsaasPayment | null {
  const matches = payments.filter((payment) =>
    payment.subscription === providerSubscriptionId &&
    payment.customer === providerCustomerId &&
    payment.status === "PENDING" &&
    payment.billingType === remote.billingType &&
    cents(payment.value) === targetMonthlyValueCents &&
    payment.dueDate === nextDueDate
  );
  if (matches.length > 1) {
    throw new ReactivationError("MULTIPLE_REACTIVATION_PAYMENTS", 409);
  }
  return matches[0] ?? null;
}

function pendingResponse(subscription: Document) {
  const reactivation = subscription.reactivation as Record<string, unknown>;
  return {
    ok: true,
    idempotent: true,
    status: "reactivation_pending",
    requestedUnits: reactivation.requestedUnits,
    pricePerUnitCents: reactivation.pricePerUnitCents,
    targetMonthlyValueCents: reactivation.targetMonthlyValueCents,
    providerPaymentId: reactivation.providerPaymentId,
  };
}

async function markFailure(
  subscriptions: Collection<Document>,
  subscriptionId: ObjectId,
  lockToken: string,
  code: string,
  inconclusive: boolean,
) {
  await subscriptions.updateOne(
    { _id: subscriptionId, "reactivation.lockToken": lockToken },
    {
      $set: {
        "reactivation.status": inconclusive ? "reconciliation_required" : "failed",
        "reactivation.failureCode": code,
        "reactivation.updatedAt": new Date(),
      },
      $unset: {
        "reactivation.lockToken": "",
        "reactivation.lockExpiresAt": "",
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
    const input = parseReactivationRequest(body);
    if (!input) {
      return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
    }
    const quote = getPricingQuote(input.requestedUnits)!;

    const db = (await clientPromise).db(DB_NAME);
    const environment = getAsaasEnvironment();
    subscriptions = db.collection("subscriptions");
    const [subscription, activeSchoolCount] = await Promise.all([
      subscriptions.findOne(
        { companyId: auth.companyId },
        { sort: { createdAt: -1 } },
      ),
      db.collection("schools").countDocuments(activeSchoolFilter(auth.companyId)),
    ]);
    if (!subscription) throw new ReactivationError("SUBSCRIPTION_NOT_FOUND", 404);
    if (subscription.status === "past_due") {
      throw new ReactivationError("SUBSCRIPTION_PAST_DUE", 409);
    }
    const cancellation = getCancellationAccessState(subscription);
    if (cancellation.state === "cancellation_scheduled") {
      throw new ReactivationError("CANCELLATION_NOT_EFFECTIVE", 409);
    }
    if (cancellation.state !== "cancelled") {
      throw new ReactivationError("SUBSCRIPTION_NOT_CANCELLED", 409);
    }
    if (input.requestedUnits < activeSchoolCount) {
      throw new ReactivationError("REACTIVATION_CAPACITY_CONFLICT", 409);
    }
    if (isOpenQuantityChange(subscription.quantityChange)) {
      throw new ReactivationError("QUANTITY_CHANGE_IN_PROGRESS", 409);
    }
    if (
      subscription.cancellationOperation?.status === "preparing" ||
      subscription.cancellationOperation?.status === "reconciliation_required"
    ) throw new ReactivationError("CANCELLATION_IN_PROGRESS", 409);
    if (isOpenReactivation(subscription.reactivation)) {
      if (
        subscription.reactivation.status === "pending_payment" &&
        subscription.reactivation.requestedUnits === input.requestedUnits
      ) return NextResponse.json(pendingResponse(subscription));
      const expired = subscription.reactivation.status === "preparing" &&
        subscription.reactivation.lockExpiresAt instanceof Date &&
        subscription.reactivation.lockExpiresAt <= new Date();
      const recoverable = subscription.reactivation.requestedUnits === input.requestedUnits &&
        (subscription.reactivation.status === "reconciliation_required" || expired);
      if (!recoverable) throw new ReactivationError("REACTIVATION_IN_PROGRESS", 409);
    }
    const link = await getBillingProviderLink(db, subscription, environment);
    const providerSubscriptionId = providerId(link?.providerSubscriptionId, "sub_");
    const providerCustomerId = providerId(link?.providerCustomerId, "cus_");
    if (!providerSubscriptionId || !providerCustomerId) {
      throw new ReactivationError("PROVIDER_LINK_INVALID", 409);
    }
    assertAsaasMutationAllowed(environment, "reactivation");

    subscriptionId = subscription._id;
    lockToken = randomUUID();
    const now = new Date();
    const nextDueDate = typeof subscription.reactivation?.nextDueDate === "string"
      ? subscription.reactivation.nextDueDate
      : nextReactivationDueDate(now);
    const lock = await subscriptions.updateOne(
      {
        _id: subscription._id,
        companyId: auth.companyId,
        cancelAtPeriodEnd: true,
        cancellationEffectiveAt: { $lte: now },
        "quantityChange.status": { $nin: ["preparing", "pending_payment", "reconciliation_required"] },
        $or: [
          { reactivation: { $exists: false } },
          { "reactivation.status": { $in: ["failed", "reconciliation_required"] } },
          { "reactivation.lockExpiresAt": { $lte: now } },
        ],
      },
      {
        $set: {
          reactivation: {
            status: "preparing",
            requestedUnits: quote.requestedUnits,
            pricePerUnitCents: quote.pricePerUnitCents,
            targetMonthlyValueCents: quote.totalMonthlyCents,
            ...(environment === "sandbox" ? { providerSubscriptionId, providerCustomerId } : {}),
            nextDueDate,
            lockToken,
            lockExpiresAt: new Date(now.getTime() + REACTIVATION_LOCK_MS),
            requestedAt: now,
            requestedBy: auth.userId,
            updatedAt: now,
          },
          updatedAt: now,
        },
      },
    );
    if (lock.modifiedCount !== 1) {
      throw new ReactivationError("REACTIVATION_IN_PROGRESS", 409);
    }

    const remotes = await findAsaasSubscriptions(
      `subscription:${subscription._id.toString()}`,
      providerCustomerId,
    );
    if (remotes.length !== 1 || remotes[0].id !== providerSubscriptionId) {
      throw new ReactivationError("PROVIDER_SUBSCRIPTION_CONFLICT", 409);
    }
    let remote = remotes[0];
    validateRemote(remote, subscription, providerSubscriptionId, providerCustomerId);
    const ready = remote.status === "ACTIVE" &&
      (remote.endDate === null || remote.endDate === undefined) &&
      remote.nextDueDate === nextDueDate &&
      cents(remote.value) === quote.totalMonthlyCents;
    if (!ready) {
      remote = await reactivateAsaasSubscription(providerSubscriptionId, {
        value: quote.totalMonthlyCents / 100,
        nextDueDate,
      });
      validateRemote(remote, subscription, providerSubscriptionId, providerCustomerId);
    }
    if (
      remote.status !== "ACTIVE" ||
      (remote.endDate !== null && remote.endDate !== undefined) ||
      remote.nextDueDate !== nextDueDate ||
      cents(remote.value) !== quote.totalMonthlyCents
    ) throw new ReactivationError("PROVIDER_STATE_NOT_RECONCILED", 409);

    const payments = await listAsaasSubscriptionPayments(providerSubscriptionId);
    const payment = matchingPendingPayment(
      payments,
      remote,
      providerSubscriptionId,
      providerCustomerId,
      quote.totalMonthlyCents,
      nextDueDate,
    );
    if (!payment) throw new ReactivationError("REACTIVATION_PAYMENT_UNAVAILABLE", 409);

    const pendingAt = new Date();
    if (environment === "production") {
      await upsertBillingProviderLink(db, subscription, environment, {
        providerCustomerId,
        providerSubscriptionId,
        reactivationPaymentId: payment.id,
      });
    }
    const persisted = await subscriptions.updateOne(
      {
        _id: subscription._id,
        companyId: auth.companyId,
        "reactivation.status": "preparing",
        "reactivation.lockToken": lockToken,
      },
      {
        $set: {
          "reactivation.status": "pending_payment",
          "reactivation.providerPaymentId": payment.id,
          "reactivation.providerPaymentDueDate": payment.dueDate,
          "reactivation.updatedAt": pendingAt,
          updatedAt: pendingAt,
        },
        $unset: {
          "reactivation.lockToken": "",
          "reactivation.lockExpiresAt": "",
          "reactivation.failureCode": "",
        },
      },
    );
    if (persisted.modifiedCount !== 1) {
      throw new ReactivationError("REACTIVATION_PERSISTENCE_CONFLICT", 409);
    }
    return NextResponse.json({
      ok: true,
      idempotent: false,
      status: "reactivation_pending",
      requestedUnits: quote.requestedUnits,
      pricePerUnitCents: quote.pricePerUnitCents,
      targetMonthlyValueCents: quote.totalMonthlyCents,
      providerPaymentId: payment.id,
    });
  } catch (error) {
    const code = error instanceof ReactivationError
      ? error.code
      : error instanceof AsaasCustomerRequestError
        ? error.code
        : "REACTIVATION_FAILED";
    if (subscriptions && subscriptionId && lockToken) {
      const inconclusive = error instanceof AsaasCustomerRequestError && error.inconclusive ||
        code === "REACTIVATION_PERSISTENCE_CONFLICT" ||
        code === "REACTIVATION_PAYMENT_UNAVAILABLE";
      await markFailure(subscriptions, subscriptionId, lockToken, code, inconclusive)
        .catch(() => undefined);
    }
    const status = error instanceof ReactivationError
      ? error.status
      : error instanceof AsaasCustomerRequestError
        ? error.inconclusive ? 503 : 502
        : 500;
    const errorMessage = code === "SUBSCRIPTION_PAST_DUE"
      ? "Regularize o pagamento em atraso pelo fluxo financeiro existente."
      : code === "CANCELLATION_NOT_EFFECTIVE"
        ? "Use a opção Manter minha assinatura antes da data de cancelamento."
        : code === "REACTIVATION_CAPACITY_CONFLICT"
          ? "A quantidade escolhida é menor que o número de unidades ativas."
          : "Não foi possível iniciar a reativação agora. Tente novamente mais tarde.";
    return NextResponse.json({ error: errorMessage, code }, { status });
  }
}
