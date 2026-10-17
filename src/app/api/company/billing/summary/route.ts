import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import { activeSchoolFilter } from "@/lib/schools";
import { getPricingQuote } from "@/lib/plans";
import {
  billingTypeLabel,
  isPendingQuantityChange,
  paymentStatusLabel,
  subscriptionStatusLabel,
} from "@/lib/billing-summary";
import {
  findAsaasSubscriptions,
  listAsaasSubscriptionPayments,
  type AsaasPayment,
} from "@/lib/asaas-subscriptions";

export const dynamic = "force-dynamic";

function cents(value: number): number {
  return Math.round(value * 100);
}

function publicPayment(payment: AsaasPayment, relatedToQuantityChange = false) {
  return {
    status: payment.status,
    statusLabel: paymentStatusLabel(payment.status),
    valueCents: cents(payment.value),
    dueDate: payment.dueDate,
    paymentDate: payment.paymentDate ?? payment.confirmedDate ?? null,
    billingType: payment.billingType,
    billingTypeLabel: billingTypeLabel(payment.billingType),
    relatedToQuantityChange,
    action: payment.status === "PENDING"
      ? { label: "Pagar agora", href: `/api/company/billing/payment/${payment.id}/pix` }
      : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const { auth } = authResult;
    if (auth.role !== "company_admin" || !auth.companyId) {
      return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const [company, subscription, activeUnits, archivedUnits] = await Promise.all([
      db.collection("companies").findOne({ _id: auth.companyId }),
      db.collection("subscriptions").findOne(
        { companyId: auth.companyId },
        { sort: { createdAt: -1 } },
      ),
      db.collection("schools").countDocuments(activeSchoolFilter(auth.companyId)),
      db.collection("schools").countDocuments({
        companyId: auth.companyId,
        status: "archived",
      }),
    ]);
    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    }
    if (!subscription) {
      return NextResponse.json({
        company: { status: company.status },
        subscription: null,
        remote: { available: false, warning: null },
      });
    }

    const maxUnits = Number(subscription.maxUnits ?? 0);
    const pricing = getPricingQuote(maxUnits);
    const availableUnits = Math.max(0, maxUnits - activeUnits);
    const quantityChange = isPendingQuantityChange(subscription.quantityChange)
      ? {
          type: subscription.quantityChange.type,
          fromUnits: subscription.quantityChange.fromUnits,
          toUnits: subscription.quantityChange.toUnits,
          targetMonthlyValueCents: subscription.quantityChange.targetMonthlyValueCents,
          statusLabel: "Alteração de plano aguardando pagamento",
        }
      : null;
    const pricingOptions = Array.from({ length: 10 }, (_, index) => {
      const quote = getPricingQuote(index + 1)!;
      return {
        units: quote.requestedUnits,
        pricePerUnitCents: quote.pricePerUnitCents,
        totalMonthlyCents: quote.totalMonthlyCents,
      };
    });

    let remote: Record<string, unknown> = {
      available: false,
      warning: "Não foi possível atualizar algumas informações financeiras agora.",
      renewal: null,
      pendingPayment: null,
      payments: [],
    };
    try {
      if (
        subscription.provider !== "asaas" ||
        subscription.providerEnvironment !== "sandbox" ||
        typeof subscription.providerSubscriptionId !== "string" ||
        typeof subscription.providerCustomerId !== "string"
      ) throw new Error("PROVIDER_LINK_INVALID");
      const subscriptions = await findAsaasSubscriptions(
        `subscription:${subscription._id.toString()}`,
        subscription.providerCustomerId,
      );
      if (
        subscriptions.length !== 1 ||
        subscriptions[0].id !== subscription.providerSubscriptionId ||
        subscriptions[0].customer !== subscription.providerCustomerId
      ) throw new Error("PROVIDER_LINK_CONFLICT");
      const providerSubscription = subscriptions[0];
      const payments = await listAsaasSubscriptionPayments(
        subscription.providerSubscriptionId,
      );
      if (payments.some((payment) =>
        payment.subscription !== subscription.providerSubscriptionId ||
        payment.customer !== subscription.providerCustomerId
      )) throw new Error("PROVIDER_PAYMENT_CONFLICT");
      const orderedPayments = [...payments].sort((left, right) =>
        right.dueDate.localeCompare(left.dueDate)
      );
      const pending = orderedPayments.find((payment) => payment.status === "PENDING") ?? null;
      const renewalPaymentGenerated = orderedPayments.some(
        (payment) => payment.dueDate === providerSubscription.nextDueDate,
      );
      remote = {
        available: true,
        warning: null,
        renewal: {
          nextDueDate: providerSubscription.nextDueDate,
          valueCents: cents(providerSubscription.value),
          paymentGenerated: renewalPaymentGenerated,
        },
        pendingPayment: pending ? publicPayment(
          pending,
          subscription.quantityChange?.status === "pending_payment" &&
            subscription.quantityChange?.providerPaymentId === pending.id,
        ) : null,
        payments: orderedPayments.map((payment) => publicPayment(payment)),
      };
    } catch {
      // O resumo local continua disponível; erros do provedor nunca são expostos.
    }

    return NextResponse.json({
      company: { status: company.status },
      subscription: {
        status: subscription.status,
        statusLabel: subscriptionStatusLabel(subscription.status),
        maxUnits,
        requestedMaxUnits: Number(subscription.requestedMaxUnits ?? maxUnits),
        activeUnits,
        archivedUnits,
        availableUnits,
        usagePercentage: maxUnits > 0
          ? Math.min(100, Math.round((activeUnits / maxUnits) * 100))
          : 0,
        pricePerUnitCents: pricing?.pricePerUnitCents ?? 0,
        totalMonthlyValueCents: pricing?.totalMonthlyCents ?? 0,
        billingInterval: pricing?.billingInterval ?? "monthly",
      },
      quantityChange,
      pricingOptions,
      remote,
    });
  } catch (error) {
    console.error("Falha ao carregar resumo financeiro:",
      error instanceof Error ? error.name : "erro desconhecido");
    return NextResponse.json(
      { error: "Não foi possível carregar o resumo financeiro." },
      { status: 500 },
    );
  }
}
