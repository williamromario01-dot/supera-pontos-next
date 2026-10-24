import "server-only";

import type { Db, Document } from "mongodb";
import { getAsaasSubscription, listAsaasSubscriptionPayments } from "@/lib/asaas-subscriptions";
import type { AsaasEnvironment } from "@/lib/asaas";
import { upsertBillingProviderLink, type BillingProviderLink } from "@/lib/billing-provider-links";
import { reconcileExistingCheckout } from "@/lib/billing-checkout-reconciliation-core";

export async function reconcileExistingBillingCheckout(input: {
  db: Db;
  subscription: Document;
  link: BillingProviderLink;
  environment: AsaasEnvironment;
  expectedValueCents: number;
  correlationId: string;
}) {
  let stage = "get_subscription";
  try {
    const result = await reconcileExistingCheckout({
      link: input.link,
      externalReference: `subscription:${input.subscription._id.toString()}`,
      expectedValueCents: input.expectedValueCents,
    }, {
      getSubscription: async (id) => {
        stage = "get_subscription";
        return getAsaasSubscription(id);
      },
      listPayments: async (subscriptionId) => {
        stage = "list_subscription_payments";
        return listAsaasSubscriptionPayments(subscriptionId);
      },
      savePaymentLink: async (payment) => {
        stage = "persist_payment_link";
        await upsertBillingProviderLink(
          input.db,
          input.subscription,
          input.environment,
          {
            providerCustomerId: input.link.providerCustomerId,
            providerSubscriptionId: input.link.providerSubscriptionId,
            providerPaymentId: payment.id,
            providerPaymentStatus: payment.status,
            providerPaymentDueDate: payment.dueDate,
            providerPaymentReconciledAt: new Date(),
          },
        );
      },
    });
    console.info("Checkout Asaas reconciliado:", {
      correlationId: input.correlationId,
      environment: input.environment,
      internalSubscriptionId: input.subscription._id.toString(),
      stage: "complete",
      reconciliationState: result.pendingPayment ? "payment_pending" : "payment_not_available",
    });
    return result;
  } catch (error) {
    console.error("Falha na reconciliação do checkout Asaas:", {
      correlationId: input.correlationId,
      environment: input.environment,
      internalSubscriptionId: input.subscription._id.toString(),
      stage,
      reconciliationState: "failed",
      code: error instanceof Error ? error.message : "RECONCILIATION_FAILED",
    });
    throw error;
  }
}
