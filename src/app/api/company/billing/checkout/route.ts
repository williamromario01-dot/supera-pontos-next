import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import { getAsaasEnvironment } from "@/lib/asaas";
import { getBillingProviderLink } from "@/lib/billing-provider-links";
import { POST as ensureCustomer } from "../customer/route";
import { POST as ensureSubscription } from "../subscription/route";

export const dynamic = "force-dynamic";

type StepResult = {
  ok?: boolean;
  error?: string;
  diagnostic?: {
    customerCreationBlocked?: boolean;
    subscriptionCreationBlocked?: boolean;
  };
};

async function readStep(response: Response): Promise<StepResult> {
  try {
    return await response.json() as StepResult;
  } catch {
    return {};
  }
}

function forwardStepFailure(response: Response, result: StepResult) {
  return NextResponse.json(
    { error: result.error ?? "Não foi possível preparar o pagamento com segurança." },
    { status: response.status },
  );
}

export async function POST(request: NextRequest) {
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

    // Existing handlers own idempotency, locks, reconciliation and mutation gates.
    const customerResponse = await ensureCustomer(request);
    const customerResult = await readStep(customerResponse);
    if (!customerResponse.ok) return forwardStepFailure(customerResponse, customerResult);
    if (customerResult.diagnostic?.customerCreationBlocked) {
      return NextResponse.json(
        {
          error: "A geração do pagamento está temporariamente indisponível.",
          code: "CHECKOUT_MUTATIONS_BLOCKED",
          state: "provider_error",
        },
        { status: 503 },
      );
    }

    const subscriptionResponse = await ensureSubscription(request);
    const subscriptionResult = await readStep(subscriptionResponse);
    if (!subscriptionResponse.ok) {
      return forwardStepFailure(subscriptionResponse, subscriptionResult);
    }
    if (subscriptionResult.diagnostic?.subscriptionCreationBlocked) {
      return NextResponse.json(
        {
          error: "A geração do pagamento está temporariamente indisponível.",
          code: "CHECKOUT_MUTATIONS_BLOCKED",
          state: "provider_error",
        },
        { status: 503 },
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const subscription = await db.collection("subscriptions").findOne(
      { companyId: auth.companyId },
      { sort: { createdAt: -1 } },
    );
    if (!subscription) {
      return NextResponse.json(
        { error: "Assinatura não encontrada." },
        { status: 404 },
      );
    }
    const link = await getBillingProviderLink(
      db,
      subscription,
      getAsaasEnvironment(),
    );
    if (!link?.providerCustomerId || !link.providerSubscriptionId) {
      return NextResponse.json(
        {
          error: "O pagamento ainda está sendo preparado. Atualize o status em instantes.",
          code: "CHECKOUT_RECONCILIATION_REQUIRED",
          state: "reconciliation_required",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      state: link.providerPaymentId ? "payment_pending" : "processing",
      payment: link.providerPaymentId
        ? {
            action: {
              label: "Pagar com Pix",
              href: `/api/company/billing/payment/${link.providerPaymentId}/pix`,
            },
          }
        : null,
    });
  } catch (error) {
    console.error(
      "Falha ao orquestrar checkout financeiro:",
      error instanceof Error ? error.name : "erro desconhecido",
    );
    return NextResponse.json(
      { error: "Não foi possível preparar o pagamento agora." },
      { status: 500 },
    );
  }
}
