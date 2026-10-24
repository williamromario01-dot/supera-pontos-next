import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Collection, Db, Document, ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import { getPricingQuote } from "@/lib/plans";
import { AsaasCustomerRequestError } from "@/lib/asaas";
import {
  createAsaasSubscription,
  findAsaasSubscriptions,
  listAsaasSubscriptionPayments,
  type AsaasPayment,
  type AsaasSubscription,
  type CreateAsaasSubscriptionInput,
} from "@/lib/asaas-subscriptions";
import { isSandboxSubscriptionCreationAllowed } from "@/lib/sandbox-subscription-creation-gate";
import { getAsaasEnvironment, type AsaasEnvironment } from "@/lib/asaas";
import { assertAsaasMutationAllowed } from "@/lib/asaas-production";
import { getBillingProviderLink, upsertBillingProviderLink } from "@/lib/billing-provider-links";

export const dynamic = "force-dynamic";

const LINK_LOCK_MS = 2 * 60 * 1000;
const BLOCK_ASAAS_SUBSCRIPTION_CREATION = true;
const UNCERTAIN_RETRY_MS = 5 * 60 * 1000;

type BillingSubscriptionErrorCode =
  | "SUBSCRIPTION_NOT_FOUND"
  | "SUBSCRIPTION_DATA_INVALID"
  | "BILLING_PROVIDER_CONFLICT"
  | "CUSTOMER_NOT_LINKED"
  | "SUBSCRIPTION_REFERENCE_CONFLICT"
  | "SUBSCRIPTION_LINK_IN_PROGRESS"
  | "SUBSCRIPTION_LINK_RACE"
  | "PAYMENT_REFERENCE_CONFLICT"
  | "SUBSCRIPTION_CREATION_RECONCILIATION_PENDING";

class BillingSubscriptionError extends Error {
  constructor(public readonly code: BillingSubscriptionErrorCode) {
    super(code);
    this.name = "BillingSubscriptionError";
  }
}

function existingProviderId(value: unknown, prefix: string): string | null {
  return typeof value === "string" && value.startsWith(prefix) ? value : null;
}

function dateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildInput(subscription: Document): CreateAsaasSubscriptionInput {
  const customer = existingProviderId(subscription.providerCustomerId, "cus_");
  const pricing = getPricingQuote(subscription.requestedMaxUnits);
  if (!customer) throw new BillingSubscriptionError("CUSTOMER_NOT_LINKED");
  if (!pricing) throw new BillingSubscriptionError("SUBSCRIPTION_DATA_INVALID");
  return {
    customer,
    billingType: "PIX",
    value: pricing.totalMonthlyCents / 100,
    nextDueDate: dateOnlyUtc(new Date()),
    cycle: "MONTHLY",
    description: `SUPERPONTOS - ${pricing.requestedUnits} unidade(s)`,
    externalReference: `subscription:${subscription._id.toString()}`,
  };
}

function compatibleSubscription(
  candidates: AsaasSubscription[],
  input: CreateAsaasSubscriptionInput,
): AsaasSubscription | null {
  const matchingReference = candidates.filter(
    (item) => item.externalReference === input.externalReference,
  );
  const compatible = matchingReference.filter(
    (item) => item.customer === input.customer &&
      (item.billingType === input.billingType ||
        (input.billingType === "PIX" && item.billingType === "BOLETO")) &&
      item.cycle === input.cycle &&
      Math.round(item.value * 100) === Math.round(input.value * 100),
  );
  if (matchingReference.length !== compatible.length || compatible.length > 1) {
    throw new BillingSubscriptionError("SUBSCRIPTION_REFERENCE_CONFLICT");
  }
  return compatible[0] ?? null;
}

function firstCompatiblePayment(
  payments: AsaasPayment[],
  providerSubscriptionId: string,
  providerCustomerId: string,
  expectedValueCents: number,
): AsaasPayment | null {
  const compatible = payments.filter(
    (payment) => payment.subscription === providerSubscriptionId &&
      payment.customer === providerCustomerId &&
      payment.status === "PENDING" &&
      (payment.billingType === "PIX" || payment.billingType === "BOLETO") &&
      Math.round(payment.value * 100) === expectedValueCents,
  );
  if (compatible.length > 1) throw new BillingSubscriptionError("PAYMENT_REFERENCE_CONFLICT");
  return compatible[0] ?? null;
}

async function saveProviderLinks(
  db: Db,
  subscriptions: Collection<Document>,
  subscription: Document,
  environment: AsaasEnvironment,
  subscriptionId: ObjectId,
  lockToken: string,
  providerSubscription: AsaasSubscription,
  payment: AsaasPayment | null,
): Promise<void> {
  const now = new Date();
  const set: Record<string, unknown> = {
    provider: "asaas",
    providerEnvironment: "sandbox",
    providerSubscriptionId: providerSubscription.id,
    providerSubscriptionLinkedAt: now,
    updatedAt: now,
  };
  if (payment) {
    set.providerPaymentId = payment.id;
    set.providerPaymentStatus = payment.status;
    set.providerPaymentDueDate = payment.dueDate;
    set.providerPaymentValue = payment.value;
    set.providerPaymentBillingType = payment.billingType;
    set.providerPaymentReconciledAt = now;
  }
  if (environment === "production") {
    await upsertBillingProviderLink(db, subscription, environment, {
      providerCustomerId: providerSubscription.customer,
      providerSubscriptionId: providerSubscription.id,
      ...(payment ? { providerPaymentId: payment.id, providerPaymentStatus: payment.status, providerPaymentDueDate: payment.dueDate } : {}),
    });
    await subscriptions.updateOne(
      { _id: subscriptionId, "providerSubscriptionLinkLock.token": lockToken },
      { $set: { updatedAt: now }, $unset: { providerSubscriptionLinkLock: "", providerSubscriptionCreateUncertainAt: "" } },
    );
    return;
  }
  const result = await subscriptions.updateOne(
    { _id: subscriptionId, "providerSubscriptionLinkLock.token": lockToken },
    {
      $set: set,
      $unset: {
        providerSubscriptionLinkLock: "",
        providerSubscriptionCreateUncertainAt: "",
      },
    },
  );
  if (result.modifiedCount !== 1) {
    throw new BillingSubscriptionError("SUBSCRIPTION_LINK_RACE");
  }
}

export async function POST(request: NextRequest) {
  let subscriptionId: ObjectId | null = null;
  let lockToken: string | null = null;
  let stage = "authenticate";
  let retainUncertainAttempt = false;
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
    const subscriptions = db.collection("subscriptions");
    stage = "load_subscription";
    const subscription = await subscriptions.findOne(
      { companyId: auth.companyId },
      { sort: { createdAt: -1 } },
    );
    if (!subscription) throw new BillingSubscriptionError("SUBSCRIPTION_NOT_FOUND");
    const providerLink = await getBillingProviderLink(db, subscription, environment);
    const billingSubscription = providerLink
      ? { ...subscription, ...providerLink, provider: "asaas", providerEnvironment: environment }
      : environment === "production"
        ? { ...subscription, provider: "asaas", providerEnvironment: environment, providerCustomerId: undefined, providerSubscriptionId: undefined, providerPaymentId: undefined }
        : subscription;
    if (environment === "sandbox" && (billingSubscription.provider !== "asaas" || billingSubscription.providerEnvironment !== environment)) {
      throw new BillingSubscriptionError("BILLING_PROVIDER_CONFLICT");
    }

    const input = buildInput(billingSubscription);
    const pricing = getPricingQuote(subscription.requestedMaxUnits)!;
    const scopedCreationAllowed = environment === "sandbox" && isSandboxSubscriptionCreationAllowed({ companyId: auth.companyId.toString(), subscriptionId: subscription._id.toString(), providerCustomerId: input.customer, externalReference: input.externalReference, requestedMaxUnits: pricing.requestedUnits, valueCents: pricing.totalMonthlyCents });
    subscriptionId = subscription._id;
    lockToken = randomUUID();
    const now = new Date();
    stage = "acquire_lock";
    const lockResult = await subscriptions.updateOne(
      {
        _id: subscriptionId,
        $or: [
          { "providerSubscriptionLinkLock.expiresAt": { $lt: now } },
          { providerSubscriptionLinkLock: { $exists: false } },
        ],
      },
      { $set: { providerSubscriptionLinkLock: {
        token: lockToken,
        acquiredAt: now,
        expiresAt: new Date(now.getTime() + LINK_LOCK_MS),
      } } },
    );
    if (lockResult.modifiedCount !== 1) {
      throw new BillingSubscriptionError("SUBSCRIPTION_LINK_IN_PROGRESS");
    }

    stage = "reconcile_subscription";
    let providerSubscription: AsaasSubscription | null = null;
    const storedId = existingProviderId(billingSubscription.providerSubscriptionId, "sub_");
    if (storedId) {
      const candidates = await findAsaasSubscriptions(
        input.externalReference,
        input.customer,
      );
      providerSubscription = candidates.find((item) => item.id === storedId) ?? null;
      if (!providerSubscription) {
        throw new BillingSubscriptionError("SUBSCRIPTION_REFERENCE_CONFLICT");
      }
    } else {
      const candidates = await findAsaasSubscriptions(
        input.externalReference,
        input.customer,
      );
      providerSubscription = compatibleSubscription(candidates, input);
    }

    if (!providerSubscription) {
      stage = "before_create_subscription";
      const uncertainAt = subscription.providerSubscriptionCreateUncertainAt instanceof Date ? subscription.providerSubscriptionCreateUncertainAt : null;
      if (uncertainAt && now.getTime() - uncertainAt.getTime() < UNCERTAIN_RETRY_MS) {
        retainUncertainAttempt = true;
        throw new BillingSubscriptionError("SUBSCRIPTION_CREATION_RECONCILIATION_PENDING");
      }
      const creationAllowed = environment === "sandbox"
        ? !BLOCK_ASAAS_SUBSCRIPTION_CREATION || scopedCreationAllowed
        : (() => { try { assertAsaasMutationAllowed(environment, "subscription_creation"); return true; } catch { return false; } })();
      if (!creationAllowed) {
        return NextResponse.json({
          ok: true,
          diagnostic: { stage, subscriptionCreationBlocked: true },
        });
      }
      await subscriptions.updateOne(
        { _id: subscriptionId, "providerSubscriptionLinkLock.token": lockToken },
        { $set: { providerSubscriptionCreateUncertainAt: new Date() } },
      );
      retainUncertainAttempt = true;
      stage = "create_subscription";
      try {
        providerSubscription = await createAsaasSubscription(input);
      } catch (error) {
        if (error instanceof AsaasCustomerRequestError && error.inconclusive) {
          const recovered = compatibleSubscription(await findAsaasSubscriptions(input.externalReference, input.customer), input);
          if (!recovered) throw new BillingSubscriptionError("SUBSCRIPTION_CREATION_RECONCILIATION_PENDING");
          providerSubscription = recovered;
        } else throw error;
      }
    }

    stage = "list_subscription_payments";
    const payments = await listAsaasSubscriptionPayments(providerSubscription.id);
    const payment = firstCompatiblePayment(
      payments,
      providerSubscription.id,
      input.customer,
      pricing.totalMonthlyCents,
    );
    await saveProviderLinks(
      db,
      subscriptions,
      subscription,
      environment,
      subscriptionId,
      lockToken,
      providerSubscription,
      payment,
    );
    lockToken = null;
    retainUncertainAttempt = false;
    return NextResponse.json({
      ok: true,
      provider: "asaas",
      linked: true,
      paymentFound: Boolean(payment),
    });
  } catch (error) {
    console.error("Falha ao vincular assinatura Asaas:", {
      stage,
      code: error instanceof BillingSubscriptionError ||
        error instanceof AsaasCustomerRequestError
        ? error.message
        : "UNEXPECTED_ERROR",
      asaas: error instanceof AsaasCustomerRequestError
        ? { status: error.status, details: error.details }
        : undefined,
    });
    const status = error instanceof BillingSubscriptionError ? 409
      : error instanceof AsaasCustomerRequestError
        ? error.inconclusive ? 503 : 502
        : 500;
    return NextResponse.json(
      { error: "Não foi possível concluir a assinatura financeira com segurança." },
      { status },
    );
  } finally {
    if (subscriptionId && lockToken) {
      try {
        const client = await clientPromise;
        await client.db(DB_NAME).collection("subscriptions").updateOne(
          { _id: subscriptionId, "providerSubscriptionLinkLock.token": lockToken },
          { $unset: retainUncertainAttempt
            ? { providerSubscriptionLinkLock: "" }
            : { providerSubscriptionLinkLock: "", providerSubscriptionCreateUncertainAt: "" } },
        );
      } catch {
        console.error("Falha ao liberar lock da assinatura Asaas.");
      }
    }
  }
}
