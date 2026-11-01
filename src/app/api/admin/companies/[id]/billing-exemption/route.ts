import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import {
  ALLOWED_EXEMPTION_MONTHS,
  calculateMonthsEnd,
  exemptionProviderAction,
  isBillingExemptionActive,
  normalizeBillingExemption,
  parseDateOnly,
  type BillingExemptionType,
} from "@/lib/billing-exemption";
import { getAsaasEnvironment } from "@/lib/asaas";
import { getBillingProviderLink } from "@/lib/billing-provider-links";

type Context = { params: Promise<{ id: string }> };

function publicSnapshot(subscription: Document | null) {
  return {
    subscriptionStatus: subscription?.status ?? null,
    billingExemption: subscription?.billingExemption ?? null,
  };
}

async function authorize(request: NextRequest, id: string) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) {
    return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  if (result.auth.role !== "super_admin") {
    return {
      response: NextResponse.json(
        { error: "Acesso exclusivo do super administrador." },
        { status: 403 },
      ),
    };
  }
  if (!ObjectId.isValid(id)) {
    return { response: NextResponse.json({ error: "Empresa inválida." }, { status: 400 }) };
  }
  return { auth: result.auth, companyId: new ObjectId(id) };
}

function parseGrant(body: unknown, now: Date) {
  if (!body || typeof body !== "object") return null;
  const item = body as Record<string, unknown>;
  if (item.confirm !== true) return null;
  const type = item.type as BillingExemptionType;
  const reason = typeof item.reason === "string" ? item.reason.trim() : "";
  const startsAt = parseDateOnly(item.startsAt);
  if (!["period", "months", "indefinite"].includes(type) || !startsAt || reason.length < 3 || reason.length > 500) {
    return null;
  }
  let endsAt: Date | null = null;
  let months: number | null = null;
  if (type === "period") {
    endsAt = parseDateOnly(item.endsAt, true);
    if (!endsAt || endsAt < startsAt) return null;
  } else if (type === "months") {
    months = Number(item.months);
    if (!ALLOWED_EXEMPTION_MONTHS.includes(months as typeof ALLOWED_EXEMPTION_MONTHS[number])) {
      return null;
    }
    endsAt = calculateMonthsEnd(startsAt, months);
  }
  return {
    type,
    reason,
    startsAt,
    endsAt,
    months,
    initialStatus: startsAt > now ? "scheduled" as const : "active" as const,
  };
}

async function upsertExemption(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const authorization = await authorize(request, id);
  if ("response" in authorization) return authorization.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const now = new Date();
  const grant = parseGrant(body, now);
  if (!grant) {
    return NextResponse.json(
      { error: "Dados inválidos ou confirmação explícita ausente." },
      { status: 400 },
    );
  }
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const [company, subscription] = await Promise.all([
    db.collection("companies").findOne({ _id: authorization.companyId }),
    db.collection("subscriptions").findOne(
      { companyId: authorization.companyId },
      { sort: { createdAt: -1 } },
    ),
  ]);
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  if (!subscription) return NextResponse.json({ error: "Assinatura local não encontrada." }, { status: 409 });

  const providerLink = await getBillingProviderLink(db, subscription, getAsaasEnvironment());
  const previous = publicSnapshot(subscription);
  const existing = normalizeBillingExemption(subscription.billingExemption);
  const providerAction = exemptionProviderAction({
    ...subscription,
    providerSubscriptionId: providerLink?.providerSubscriptionId ?? subscription.providerSubscriptionId,
    providerPaymentId: providerLink?.providerPaymentId ?? subscription.providerPaymentId,
  });
  const exemption = {
    status: providerAction.required ? "pending_provider_action" : grant.initialStatus,
    type: grant.type,
    startsAt: grant.startsAt,
    endsAt: grant.endsAt,
    months: grant.months,
    reason: grant.reason,
    grantedBy: existing?.grantedBy ?? authorization.auth.userId,
    grantedAt: existing?.grantedAt ?? now,
    updatedAt: now,
    providerAction,
    previousCompanyStatus: existing
      ? subscription.billingExemption?.previousCompanyStatus
      : company.status,
    previousSubscriptionStatus: existing
      ? subscription.billingExemption?.previousSubscriptionStatus
      : subscription.status,
  };
  const next = {
    subscriptionStatus: providerAction.required || grant.initialStatus === "scheduled"
      ? subscription.status
      : "active",
    billingExemption: exemption,
  };

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection("subscriptions").updateOne(
        { _id: subscription._id, companyId: authorization.companyId },
        {
          $set: {
            billingExemption: exemption,
            ...(providerAction.required || grant.initialStatus === "scheduled"
              ? {}
              : { status: "active" }),
            updatedAt: now,
          },
        },
        { session },
      );
      if (!providerAction.required && grant.initialStatus === "active") {
        await db.collection("companies").updateOne(
          { _id: authorization.companyId },
          { $set: { status: "active", updatedAt: now } },
          { session },
        );
      }
      await db.collection("billingExemptionAudits").insertOne({
        action: existing ? "updated" : "granted",
        companyId: authorization.companyId,
        subscriptionId: subscription._id,
        superAdminId: authorization.auth.userId,
        occurredAt: now,
        reason: grant.reason,
        previous,
        next,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
  return NextResponse.json({
    exemption,
    activeLocally: !providerAction.required && grant.initialStatus === "active",
    providerActionRequired: providerAction.required,
    message: providerAction.required
      ? "A isenção foi registrada e aguarda tratamento seguro da assinatura/cobrança existente no Asaas. Nenhuma mutação remota foi executada."
      : "Isenção de mensalidade registrada.",
  }, { status: providerAction.required ? 202 : 200 });
}

export const POST = upsertExemption;
export const PATCH = upsertExemption;

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const authorization = await authorize(request, id);
  if ("response" in authorization) return authorization.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const item = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const reason = typeof item.reason === "string" ? item.reason.trim() : "";
  if (item.confirm !== true || reason.length < 3 || reason.length > 500) {
    return NextResponse.json(
      { error: "Motivo e confirmação explícita são obrigatórios." },
      { status: 400 },
    );
  }
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const subscription = await db.collection("subscriptions").findOne(
    { companyId: authorization.companyId },
    { sort: { createdAt: -1 } },
  );
  const current = normalizeBillingExemption(subscription?.billingExemption);
  if (!subscription || !current || current.status === "ended") {
    return NextResponse.json({ error: "Não há isenção vigente para encerrar." }, { status: 409 });
  }
  const now = new Date();
  const wasLocallyActive = isBillingExemptionActive(current, now);
  const ended = {
    ...subscription.billingExemption,
    status: "ended",
    endedAt: now,
    endedBy: authorization.auth.userId,
    endReason: reason,
    updatedAt: now,
  };
  const nextStatus = wasLocallyActive ? "pending" : subscription.status;
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection("subscriptions").updateOne(
        { _id: subscription._id, companyId: authorization.companyId },
        { $set: { billingExemption: ended, status: nextStatus, updatedAt: now } },
        { session },
      );
      if (wasLocallyActive) {
        await db.collection("companies").updateOne(
          { _id: authorization.companyId },
          { $set: { status: "pending_payment", updatedAt: now } },
          { session },
        );
      }
      await db.collection("billingExemptionAudits").insertOne({
        action: "ended",
        companyId: authorization.companyId,
        subscriptionId: subscription._id,
        superAdminId: authorization.auth.userId,
        occurredAt: now,
        reason,
        previous: publicSnapshot(subscription),
        next: { subscriptionStatus: nextStatus, billingExemption: ended },
      }, { session });
    });
  } finally {
    await session.endSession();
  }
  return NextResponse.json({
    exemption: ended,
    billingResumeRequired: wasLocallyActive,
    message: "Isenção encerrada. Nenhum pagamento foi criado ou marcado como recebido.",
  });
}
