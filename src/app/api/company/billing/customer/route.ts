import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Collection, Document, ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { isSandboxCustomerCreationAllowed } from "@/lib/sandbox-customer-creation-gate";
import {
  AsaasCustomerRequestError,
  createAsaasCustomer,
  findAsaasCustomersByExternalReference,
  type AsaasCustomer,
  type CreateAsaasCustomerInput,
} from "@/lib/asaas";
import {
  DB_NAME,
  isValidCnpj,
  isValidEmail,
  normalizeDigits,
  normalizeEmail,
} from "@/lib/saas";

export const dynamic = "force-dynamic";

const LINK_LOCK_MS = 2 * 60 * 1000;
const UNCERTAIN_RETRY_MS = 5 * 60 * 1000;
// Diagnostic safety barrier. Keep enabled until a real Asaas customer creation
// is explicitly authorized after this investigation.
const BLOCK_ASAAS_CUSTOMER_CREATION = true;

function sanitizedUnexpectedError(error: unknown) {
  const value = error instanceof Error ? error : new Error(String(error));
  const sanitize = (text: string | undefined) =>
    text
      ?.replace(/(access_token|authorization|cookie|passwordHash|password|token)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '<redacted-email>')
      .replace(/\b\d{10,14}\b/g, '<redacted-document-or-phone>');
  const technicalCode = (error as { code?: unknown } | null)?.code;

  return {
    name: sanitize(value.name),
    message: sanitize(value.message),
    stack: sanitize(value.stack),
    code:
      typeof technicalCode === 'string' ||
      typeof technicalCode === 'number'
        ? technicalCode
        : undefined,
  };
}

type BillingErrorCode =
  | "COMPANY_BILLING_DATA_INVALID"
  | "SUBSCRIPTION_NOT_FOUND"
  | "BILLING_PROVIDER_CONFLICT"
  | "CUSTOMER_LINK_IN_PROGRESS"
  | "CUSTOMER_REFERENCE_CONFLICT"
  | "CUSTOMER_CREATION_RECONCILIATION_PENDING"
  | "CUSTOMER_LINK_RACE";

class BillingCustomerError extends Error {
  constructor(public readonly code: BillingErrorCode) {
    super(code);
    this.name = "BillingCustomerError";
  }
}

function existingCustomerId(subscription: Document): string | null {
  return typeof subscription.providerCustomerId === "string" &&
    subscription.providerCustomerId.startsWith("cus_")
    ? subscription.providerCustomerId
    : null;
}

function assertProviderCompatibility(subscription: Document): void {
  if (subscription.provider && subscription.provider !== "asaas") {
    throw new BillingCustomerError("BILLING_PROVIDER_CONFLICT");
  }
  if (
    subscription.providerEnvironment &&
    subscription.providerEnvironment !== "sandbox"
  ) {
    throw new BillingCustomerError("BILLING_PROVIDER_CONFLICT");
  }
}

function buildCustomerInput(
  company: Document,
): CreateAsaasCustomerInput {
  const name = String(
    company.tradeName || company.legalName || "",
  ).trim();
  const cpfCnpj = normalizeDigits(company.cnpj);
  const email = normalizeEmail(company.email);
  const mobilePhone = normalizeDigits(company.phone);

  if (!name || name.length > 180 || !isValidCnpj(cpfCnpj)) {
    throw new BillingCustomerError("COMPANY_BILLING_DATA_INVALID");
  }

  const input: CreateAsaasCustomerInput = {
    name,
    cpfCnpj,
    externalReference: company._id.toString(),
    notificationDisabled: true,
  };

  if (email && isValidEmail(email)) input.email = email;
  if (mobilePhone.length >= 10 && mobilePhone.length <= 13) {
    input.mobilePhone = mobilePhone;
  }
  return input;
}

function selectCompatibleCustomer(
  customers: AsaasCustomer[],
  input: CreateAsaasCustomerInput,
): AsaasCustomer | null {
  const matchingReference = customers.filter(
    (customer) =>
      customer.externalReference === input.externalReference,
  );
  const compatible = matchingReference.filter(
    (customer) =>
      normalizeDigits(customer.cpfCnpj) === input.cpfCnpj,
  );

  if (
    matchingReference.length !== compatible.length ||
    compatible.length > 1
  ) {
    throw new BillingCustomerError("CUSTOMER_REFERENCE_CONFLICT");
  }
  return compatible[0] ?? null;
}

async function findCompatibleCustomer(
  input: CreateAsaasCustomerInput,
): Promise<AsaasCustomer | null> {
  const customers =
    await findAsaasCustomersByExternalReference(
      input.externalReference,
    );
  return selectCompatibleCustomer(customers, input);
}

async function saveCustomerLink(
  subscriptions: Collection<Document>,
  subscriptionId: ObjectId,
  lockToken: string,
  customerId: string,
): Promise<void> {
  const linkedAt = new Date();
  const result = await subscriptions.updateOne(
    {
      _id: subscriptionId,
      "providerCustomerLinkLock.token": lockToken,
      $or: [
        { providerCustomerId: null },
        { providerCustomerId: { $exists: false } },
      ],
    },
    {
      $set: {
        provider: "asaas",
        providerCustomerId: customerId,
        providerEnvironment: "sandbox",
        providerCustomerLinkedAt: linkedAt,
        updatedAt: linkedAt,
      },
      $unset: {
        providerCustomerLinkLock: "",
        providerCustomerCreateUncertainAt: "",
      },
    },
  );

  if (result.modifiedCount === 1) return;
  const current = await subscriptions.findOne(
    { _id: subscriptionId },
    { projection: { providerCustomerId: 1 } },
  );
  if (existingCustomerId(current ?? {}) === customerId) return;
  throw new BillingCustomerError("CUSTOMER_LINK_RACE");
}

export async function POST(request: NextRequest) {
  let subscriptionId: ObjectId | null = null;
  let lockToken: string | null = null;
  let retainUncertainAttempt = false;
  let stage = 'authenticate';

  try {
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const { auth } = authResult;
    if (auth.role !== "company_admin" || !auth.companyId) {
      return NextResponse.json(
        { error: "Acesso exclusivo do responsável empresarial." },
        { status: 403 },
      );
    }

    stage = 'load_company';
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const companies = db.collection("companies");
    const subscriptions = db.collection("subscriptions");
    const company = await companies.findOne({ _id: auth.companyId });

    if (!company) {
      return NextResponse.json(
        { error: "Empresa não encontrada." },
        { status: 404 },
      );
    }
    stage = 'load_subscription';
    const subscription = await subscriptions.findOne(
      { companyId: auth.companyId },
      { sort: { createdAt: -1 } },
    );
    if (!subscription) {
      throw new BillingCustomerError("SUBSCRIPTION_NOT_FOUND");
    }

    stage = 'validate_provider';
    assertProviderCompatibility(subscription);
    stage = 'existing_provider_customer';
    if (existingCustomerId(subscription)) {
      return NextResponse.json({
        ok: true,
        provider: "asaas",
        linked: true,
        reused: true,
      });
    }

    stage = 'build_customer_payload';
    const input = buildCustomerInput(company);
    const scopedCreationAllowed = isSandboxCustomerCreationAllowed({
      companyId: auth.companyId.toString(),
      externalReference: input.externalReference,
      subscriptionId: subscription._id.toString(),
    });
    const now = new Date();
    subscriptionId = subscription._id;
    lockToken = randomUUID();

    stage = 'acquire_lock';
    const lockResult = await subscriptions.updateOne(
      {
        _id: subscriptionId,
        $and: [
          {
            $or: [
              { providerCustomerId: null },
              { providerCustomerId: { $exists: false } },
            ],
          },
          {
            $or: [
              { provider: null },
              { provider: { $exists: false } },
              { provider: "asaas" },
            ],
          },
          {
            $or: [
              {
                "providerCustomerLinkLock.expiresAt": {
                  $lt: now,
                },
              },
              {
                providerCustomerLinkLock: {
                  $exists: false,
                },
              },
            ],
          },
        ],
      },
      {
        $set: {
          provider: "asaas",
          providerEnvironment: "sandbox",
          providerCustomerLinkLock: {
            token: lockToken,
            acquiredAt: now,
            expiresAt: new Date(now.getTime() + LINK_LOCK_MS),
          },
        },
      },
    );

    if (lockResult.modifiedCount !== 1) {
      const current = await subscriptions.findOne(
        { _id: subscriptionId },
        { projection: { providerCustomerId: 1 } },
      );
      if (existingCustomerId(current ?? {})) {
        return NextResponse.json({
          ok: true,
          provider: "asaas",
          linked: true,
          reused: true,
        });
      }
      throw new BillingCustomerError("CUSTOMER_LINK_IN_PROGRESS");
    }

    stage = 'lookup_asaas_customer';
    const existing = await findCompatibleCustomer(input);
    stage = 'validate_asaas_customer';
    if (existing) {
      await saveCustomerLink(
        subscriptions,
        subscriptionId,
        lockToken,
        existing.id,
      );
      lockToken = null;
      return NextResponse.json({
        ok: true,
        provider: "asaas",
        linked: true,
        reused: true,
      });
    }

    const uncertainAt =
      subscription.providerCustomerCreateUncertainAt instanceof Date
        ? subscription.providerCustomerCreateUncertainAt
        : null;
    if (
      uncertainAt &&
      now.getTime() - uncertainAt.getTime() < UNCERTAIN_RETRY_MS
    ) {
      retainUncertainAttempt = true;
      throw new BillingCustomerError(
        "CUSTOMER_CREATION_RECONCILIATION_PENDING",
      );
    }

    stage = 'record_customer_creation_attempt';
    const attemptRecorded = await subscriptions.updateOne(
      {
        _id: subscriptionId,
        "providerCustomerLinkLock.token": lockToken,
      },
      {
        $set: {
          providerCustomerCreateUncertainAt: new Date(),
        },
      },
    );
    if (attemptRecorded.modifiedCount !== 1) {
      throw new BillingCustomerError("CUSTOMER_LINK_RACE");
    }
    retainUncertainAttempt = true;

    stage = 'before_create_customer';
    if (BLOCK_ASAAS_CUSTOMER_CREATION && !scopedCreationAllowed) {
      retainUncertainAttempt = false;
      return NextResponse.json({
        ok: true,
        diagnostic: {
          stage,
          customerCreationBlocked: true,
        },
      });
    }

    let created: AsaasCustomer;
    try {
      stage = 'create_asaas_customer';
      created = await createAsaasCustomer(input);
    } catch (error) {
      if (
        !(error instanceof AsaasCustomerRequestError) ||
        !error.inconclusive
      ) {
        retainUncertainAttempt = false;
        throw error;
      }

      try {
        const recovered = await findCompatibleCustomer(input);
        if (recovered) {
          await saveCustomerLink(
            subscriptions,
            subscriptionId,
            lockToken!,
            recovered.id,
          );
          retainUncertainAttempt = false;
          lockToken = null;
          return NextResponse.json({
            ok: true,
            provider: "asaas",
            linked: true,
            reused: true,
          });
        }
      } catch (recoveryError) {
        if (recoveryError instanceof BillingCustomerError) {
          throw recoveryError;
        }
      }

      throw new BillingCustomerError(
        "CUSTOMER_CREATION_RECONCILIATION_PENDING",
      );
    }

    await saveCustomerLink(
      subscriptions,
      subscriptionId,
      lockToken,
      created.id,
    );
    retainUncertainAttempt = false;
    lockToken = null;
    return NextResponse.json({
      ok: true,
      provider: "asaas",
      linked: true,
      reused: false,
    });
  } catch (error) {
    const safeCode =
      error instanceof BillingCustomerError ||
      error instanceof AsaasCustomerRequestError
        ? error.message
        : "UNEXPECTED_ERROR";
    console.error("Falha ao vincular customer Asaas:", {
      stage,
      safeCode,
      ...sanitizedUnexpectedError(error),
      asaas:
        error instanceof AsaasCustomerRequestError
          ? JSON.stringify({
              status: error.status,
              details: error.details,
            })
          : undefined,
    });

    if (error instanceof BillingCustomerError) {
      const status =
        error.code === "CUSTOMER_LINK_IN_PROGRESS" ||
        error.code ===
          "CUSTOMER_CREATION_RECONCILIATION_PENDING"
          ? 409
          : error.code === "COMPANY_BILLING_DATA_INVALID"
            ? 422
            : 409;
      return NextResponse.json(
        {
          error:
            "Não foi possível concluir o vínculo financeiro com segurança.",
        },
        { status },
      );
    }

    if (error instanceof AsaasCustomerRequestError) {
      return NextResponse.json(
        {
          error:
            "O serviço financeiro está temporariamente indisponível.",
        },
        { status: error.inconclusive ? 503 : 502 },
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao configurar o vínculo financeiro." },
      { status: 500 },
    );
  } finally {
    if (subscriptionId && lockToken) {
      try {
        const client = await clientPromise;
        const unset: Record<string, ""> = {
          providerCustomerLinkLock: "",
        };
        if (!retainUncertainAttempt) {
          unset.providerCustomerCreateUncertainAt = "";
        }

        await client
          .db(DB_NAME)
          .collection("subscriptions")
          .updateOne(
            {
              _id: subscriptionId,
              "providerCustomerLinkLock.token": lockToken,
            },
            { $unset: unset },
          );
      } catch {
        console.error(
          "Falha ao liberar lock do vínculo financeiro.",
        );
      }
    }
  }
}
