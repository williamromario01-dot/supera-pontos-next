import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import {
  getAsaasPayment,
  getAsaasPaymentPixQrCode,
} from "@/lib/asaas-subscriptions";
import { AsaasCustomerRequestError } from "@/lib/asaas";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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
  const subscription = await client.db(DB_NAME).collection("subscriptions").findOne(
    {
      companyId: auth.companyId,
      provider: "asaas",
      providerEnvironment: "sandbox",
    },
    {
      sort: { createdAt: -1 },
      projection: {
        _id: 1,
        providerSubscriptionId: 1,
        providerCustomerId: 1,
      },
    },
  );
  if (!subscription) {
    return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  }

  try {
    const payment = await getAsaasPayment(paymentId);
    if (
      payment.subscription !== subscription.providerSubscriptionId ||
      payment.customer !== subscription.providerCustomerId ||
      payment.status !== "PENDING"
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
