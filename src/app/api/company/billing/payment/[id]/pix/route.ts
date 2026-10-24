import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import {
  getAsaasPayment,
  getAsaasPaymentPixQrCode,
} from "@/lib/asaas-subscriptions";
import { AsaasCustomerRequestError } from "@/lib/asaas";
import { getAsaasEnvironment } from "@/lib/asaas";
import { getBillingProviderLink } from "@/lib/billing-provider-links";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authResult = await authenticateRequest(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const { auth } = authResult;
  if (auth.role !== "company_admin" || !auth.companyId) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }
  const paymentId = params.id;
  if (!/^pay_[A-Za-z0-9_-]{3,96}$/.test(paymentId)) {
    return NextResponse.json({ error: "Cobrança inválida." }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const environment = getAsaasEnvironment();
  const subscription = await db.collection("subscriptions").findOne(
    {
      companyId: auth.companyId,
    },
    {
      sort: { createdAt: -1 },
      projection: {
        _id: 1,
        providerSubscriptionId: 1,
        providerCustomerId: 1,
        providerPaymentId: 1,
        "quantityChange.providerPaymentId": 1,
        "reactivation.providerPaymentId": 1,
      },
    },
  );
  if (!subscription) {
    return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  }
  const link = await getBillingProviderLink(db, subscription, environment);
  if (!link) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });

  try {
    const payment = await getAsaasPayment(paymentId);
    const linkedLocally = paymentId === link.providerPaymentId ||
      paymentId === link.quantityChangePaymentId ||
      paymentId === link.reactivationPaymentId ||
      (environment === "sandbox" && (paymentId === subscription.quantityChange?.providerPaymentId || paymentId === subscription.reactivation?.providerPaymentId));
    if (!linkedLocally) {
      return NextResponse.json({ error: "Cobrança não disponível para Pix." }, { status: 404 });
    }
    if (
      payment.subscription !== link.providerSubscriptionId ||
      payment.customer !== link.providerCustomerId ||
      !["PENDING", "OVERDUE"].includes(payment.status)
    ) {
      return NextResponse.json({ error: "Cobrança não disponível para Pix." }, { status: 404 });
    }
    const qrCode = await getAsaasPaymentPixQrCode(paymentId);
    return NextResponse.json({
      encodedImage: qrCode.encodedImage,
      payload: qrCode.payload,
      expirationDate: qrCode.expirationDate,
    });
  } catch (error) {
    console.error("Falha ao obter Pix Asaas:", {
      code: error instanceof AsaasCustomerRequestError
        ? error.message
        : "UNEXPECTED_ERROR",
      status: error instanceof AsaasCustomerRequestError ? error.status : null,
    });
    return NextResponse.json(
      { error: "Não foi possível obter o Pix desta cobrança." },
      { status: 502 },
    );
  }
}
