import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Collection, Document, ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import { AsaasCustomerRequestError } from "@/lib/asaas";
import {
  getAsaasSubscription,
  listAsaasSubscriptionPayments,
  updateAsaasSubscriptionEndDate,
  type AsaasSubscription,
} from "@/lib/asaas-subscriptions";
import {
  deriveCancellationDates,
  getCancellationAccessState,
  parseCancellationRequest,
} from "@/lib/subscription-cancellation";
import { isOpenQuantityChange, OPEN_QUANTITY_CHANGE_STATUSES } from "@/lib/quantity-change";
import { getAsaasEnvironment } from "@/lib/asaas";
import { assertAsaasMutationAllowed } from "@/lib/asaas-production";
import { getBillingProviderLink } from "@/lib/billing-provider-links";

export const dynamic = "force-dynamic";

const CANCELLATION_LOCK_MS = 2 * 60 * 1000;

class CancellationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "CancellationError";
  }
}

function providerId(value: unknown, prefix: string): string | null {
  return typeof value === "string" && value.startsWith(prefix) && value.length <= 100
    ? value
    : null;
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
    remote.status !== "ACTIVE" ||
    remote.cycle !== "MONTHLY"
  ) throw new CancellationError("PROVIDER_SUBSCRIPTION_CONFLICT", 409);
}

async function readRemoteState(
  subscription: Document,
  providerSubscriptionId: string,
  providerCustomerId: string,
) {
  const remote = await getAsaasSubscription(providerSubscriptionId);
  validateRemote(remote, subscription, providerSubscriptionId, providerCustomerId);
  const payments = await listAsaasSubscriptionPayments(providerSubscriptionId);
  if (payments.some((payment) =>
    payment.subscription !== providerSubscriptionId ||
    payment.customer !== providerCustomerId
  )) throw new CancellationError("PROVIDER_PAYMENT_CONFLICT", 409);
  return { remote, payments };
}

async function applyProviderEndDate(
  subscription: Document,
  providerSubscriptionId: string,
  providerCustomerId: string,
  endDate: string | null,
) {
  try {
    const updated = await updateAsaasSubscriptionEndDate(providerSubscriptionId, endDate);
    validateRemote(updated, subscription, providerSubscriptionId, providerCustomerId);
    const matches = endDate === null
      ? updated.endDate === null || updated.endDate === undefined
      : updated.endDate === endDate;
    if (!matches) throw new CancellationError("PROVIDER_END_DATE_CONFLICT", 409);
  } catch (error) {
    if (!(error instanceof AsaasCustomerRequestError) || !error.inconclusive) throw error;
    const reconciled = await getAsaasSubscription(providerSubscriptionId);
    validateRemote(reconciled, subscription, providerSubscriptionId, providerCustomerId);
    const matches = endDate === null
      ? reconciled.endDate === null || reconciled.endDate === undefined
      : reconciled.endDate === endDate;
    if (!matches) throw error;
  }
}

async function markOperationFailure(
  subscriptions: Collection<Document>,
  subscriptionId: ObjectId,
  lockToken: string,
  code: string,
  reconciliationRequired: boolean,
) {
  await subscriptions.updateOne(
    { _id: subscriptionId, "cancellationOperation.lockToken": lockToken },
    {
      $set: {
        "cancellationOperation.status": reconciliationRequired
          ? "reconciliation_required"
          : "failed",
        "cancellationOperation.failureCode": code,
        "cancellationOperation.updatedAt": new Date(),
      },
      $unset: { "cancellationOperation.lockToken": "", "cancellationOperation.lockExpiresAt": "" },
    },
  );
}

function publicCancellation(subscription: Document, now = new Date()) {
  const cancellation = getCancellationAccessState(subscription, now);
  return {
    state: cancellation.state,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
    effectiveAt: cancellation.effectiveAt,
  };
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
    const input = parseCancellationRequest(body);
    if (!input) {
      return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const environment = getAsaasEnvironment();
    subscriptions = db.collection("subscriptions");
    const subscription = await subscriptions.findOne(
      { companyId: auth.companyId },
      { sort: { createdAt: -1 } },
    );
    if (!subscription) throw new CancellationError("SUBSCRIPTION_NOT_FOUND", 404);
    if (subscription.status === "past_due") {
      throw new CancellationError("SUBSCRIPTION_PAST_DUE", 409);
    }
    if (subscription.status !== "active") {
      throw new CancellationError("SUBSCRIPTION_NOT_ACTIVE", 409);
    }
    if (isOpenQuantityChange(subscription.quantityChange)) {
      throw new CancellationError("QUANTITY_CHANGE_IN_PROGRESS", 409);
    }
    const currentCancellation = getCancellationAccessState(subscription);
    if (subscription.cancelAtPeriodEnd === true) {
      if (currentCancellation.state === "cancelled") {
        throw new CancellationError("SUBSCRIPTION_ALREADY_CANCELLED", 409);
      }
      return NextResponse.json({
        ok: true,
        idempotent: true,
        cancellation: publicCancellation(subscription),
      });
    }
    const link = await getBillingProviderLink(db, subscription, environment);
    const providerSubscriptionId = providerId(link?.providerSubscriptionId, "sub_");
    const providerCustomerId = providerId(link?.providerCustomerId, "cus_");
    if (!providerSubscriptionId || !providerCustomerId) {
      throw new CancellationError("PROVIDER_LINK_INVALID", 409);
    }
    assertAsaasMutationAllowed(environment, "cancellation");

    subscriptionId = subscription._id;
    lockToken = randomUUID();
    const requestedAt = new Date();
    const lock = await subscriptions.updateOne(
      {
        _id: subscription._id,
        companyId: auth.companyId,
        status: "active",
        cancelAtPeriodEnd: { $ne: true },
        "quantityChange.status": { $nin: [...OPEN_QUANTITY_CHANGE_STATUSES] },
        $or: [
          { cancellationOperation: { $exists: false } },
          { "cancellationOperation.status": "failed" },
          { "cancellationOperation.lockExpiresAt": { $lte: requestedAt } },
        ],
      },
      {
        $set: {
          cancellationOperation: {
            type: "schedule",
            status: "preparing",
            lockToken,
            lockExpiresAt: new Date(requestedAt.getTime() + CANCELLATION_LOCK_MS),
            requestedAt,
            updatedAt: requestedAt,
          },
          updatedAt: requestedAt,
        },
      },
    );
    if (lock.modifiedCount !== 1) {
      throw new CancellationError("CANCELLATION_IN_PROGRESS", 409);
    }

    const { remote, payments } = await readRemoteState(
      subscription,
      providerSubscriptionId,
      providerCustomerId,
    );
    const dates = deriveCancellationDates(remote, payments, requestedAt);
    if (!dates) {
      throw new CancellationError("CANCELLATION_DATE_UNAVAILABLE", 409);
    }
    if (remote.endDate && remote.endDate !== dates.providerEndDate) {
      throw new CancellationError("PROVIDER_END_DATE_CONFLICT", 409);
    }
    if (remote.endDate !== dates.providerEndDate) {
      await applyProviderEndDate(
        subscription,
        providerSubscriptionId,
        providerCustomerId,
        dates.providerEndDate,
      );
    }
    const persisted = await subscriptions.updateOne(
      {
        _id: subscription._id,
        companyId: auth.companyId,
        "cancellationOperation.lockToken": lockToken,
      },
      {
        $set: {
          cancelAtPeriodEnd: true,
          cancellationRequestedAt: requestedAt,
          cancellationEffectiveAt: dates.effectiveAt,
          cancellationProviderEndDate: dates.providerEndDate,
          cancellationRequestedBy: auth.userId,
          cancellationReason: input,
          cancellationProviderUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
        $push: {
          cancellationHistory: {
            type: "scheduled",
            at: requestedAt,
            by: auth.userId,
            effectiveAt: dates.effectiveAt,
            providerEndDate: dates.providerEndDate,
            reason: input,
          },
        } as never,
        $unset: { cancellationOperation: "" },
      },
    );
    if (persisted.modifiedCount !== 1) {
      throw new CancellationError("CANCELLATION_PERSISTENCE_CONFLICT", 409);
    }
    return NextResponse.json({
      ok: true,
      idempotent: false,
      cancellation: {
        state: "cancellation_scheduled",
        cancelAtPeriodEnd: true,
        effectiveAt: dates.effectiveAt,
      },
    });
  } catch (error) {
    const code = error instanceof CancellationError
      ? error.code
      : error instanceof AsaasCustomerRequestError
        ? error.code
        : "CANCELLATION_FAILED";
    if (subscriptions && subscriptionId && lockToken) {
      await markOperationFailure(
        subscriptions,
        subscriptionId,
        lockToken,
        code,
        error instanceof AsaasCustomerRequestError && error.inconclusive ||
          code === "CANCELLATION_PERSISTENCE_CONFLICT",
      ).catch(() => undefined);
    }
    const status = error instanceof CancellationError
      ? error.status
      : error instanceof AsaasCustomerRequestError
        ? error.inconclusive ? 503 : 502
        : 500;
    return NextResponse.json({
      error: code === "QUANTITY_CHANGE_IN_PROGRESS"
        ? "Existe uma alteração de plano aguardando conclusão. Finalize essa alteração antes de solicitar o cancelamento."
        : code === "SUBSCRIPTION_PAST_DUE"
          ? "Regularize o pagamento em atraso antes de solicitar o cancelamento."
          : "Não foi possível agendar o cancelamento agora. Tente novamente mais tarde.",
      code,
    }, { status });
  }
}

export async function DELETE(request: NextRequest) {
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
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const environment = getAsaasEnvironment();
    subscriptions = db.collection("subscriptions");
    const subscription = await subscriptions.findOne(
      { companyId: auth.companyId },
      { sort: { createdAt: -1 } },
    );
    if (!subscription) throw new CancellationError("SUBSCRIPTION_NOT_FOUND", 404);
    if (subscription.cancelAtPeriodEnd !== true) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        cancellation: publicCancellation(subscription),
      });
    }
    const cancellation = getCancellationAccessState(subscription);
    if (cancellation.state === "cancelled") {
      throw new CancellationError("CANCELLATION_ALREADY_EFFECTIVE", 409);
    }
    const link = await getBillingProviderLink(db, subscription, environment);
    const providerSubscriptionId = providerId(link?.providerSubscriptionId, "sub_");
    const providerCustomerId = providerId(link?.providerCustomerId, "cus_");
    if (!providerSubscriptionId || !providerCustomerId) {
      throw new CancellationError("PROVIDER_LINK_INVALID", 409);
    }
    assertAsaasMutationAllowed(environment, "cancellation");

    subscriptionId = subscription._id;
    lockToken = randomUUID();
    const revertedAt = new Date();
    const lock = await subscriptions.updateOne(
      {
        _id: subscription._id,
        companyId: auth.companyId,
        cancelAtPeriodEnd: true,
        cancellationEffectiveAt: { $gt: revertedAt },
        $or: [
          { cancellationOperation: { $exists: false } },
          { "cancellationOperation.status": "failed" },
          { "cancellationOperation.lockExpiresAt": { $lte: revertedAt } },
        ],
      },
      {
        $set: {
          cancellationOperation: {
            type: "revert",
            status: "preparing",
            lockToken,
            lockExpiresAt: new Date(revertedAt.getTime() + CANCELLATION_LOCK_MS),
            requestedAt: revertedAt,
            updatedAt: revertedAt,
          },
          updatedAt: revertedAt,
        },
      },
    );
    if (lock.modifiedCount !== 1) {
      throw new CancellationError("CANCELLATION_IN_PROGRESS", 409);
    }

    const { remote } = await readRemoteState(
      subscription,
      providerSubscriptionId,
      providerCustomerId,
    );
    if (
      remote.endDate &&
      remote.endDate !== subscription.cancellationProviderEndDate
    ) throw new CancellationError("PROVIDER_END_DATE_CONFLICT", 409);
    if (remote.endDate !== null && remote.endDate !== undefined) {
      await applyProviderEndDate(
        subscription,
        providerSubscriptionId,
        providerCustomerId,
        null,
      );
    }
    const persisted = await subscriptions.updateOne(
      {
        _id: subscription._id,
        companyId: auth.companyId,
        "cancellationOperation.lockToken": lockToken,
      },
      {
        $set: {
          cancelAtPeriodEnd: false,
          cancellationRevertedAt: revertedAt,
          cancellationRevertedBy: auth.userId,
          cancellationProviderUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
        $push: {
          cancellationHistory: {
            type: "reverted",
            at: revertedAt,
            by: auth.userId,
            scheduledEffectiveAt: subscription.cancellationEffectiveAt,
          },
        } as never,
        $unset: { cancellationOperation: "" },
      },
    );
    if (persisted.modifiedCount !== 1) {
      throw new CancellationError("CANCELLATION_PERSISTENCE_CONFLICT", 409);
    }
    return NextResponse.json({
      ok: true,
      idempotent: false,
      cancellation: {
        state: "none",
        cancelAtPeriodEnd: false,
        effectiveAt: null,
      },
    });
  } catch (error) {
    const code = error instanceof CancellationError
      ? error.code
      : error instanceof AsaasCustomerRequestError
        ? error.code
        : "CANCELLATION_REVERSAL_FAILED";
    if (subscriptions && subscriptionId && lockToken) {
      await markOperationFailure(
        subscriptions,
        subscriptionId,
        lockToken,
        code,
        error instanceof AsaasCustomerRequestError && error.inconclusive ||
          code === "CANCELLATION_PERSISTENCE_CONFLICT",
      ).catch(() => undefined);
    }
    const status = error instanceof CancellationError
      ? error.status
      : error instanceof AsaasCustomerRequestError
        ? error.inconclusive ? 503 : 502
        : 500;
    return NextResponse.json({
      error: code === "CANCELLATION_ALREADY_EFFECTIVE"
        ? "O cancelamento já foi efetivado e não pode mais ser revertido por esta opção."
        : "Não foi possível manter a assinatura agora. Tente novamente mais tarde.",
      code,
    }, { status });
  }
}
