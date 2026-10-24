export type ReconciliationSubscription = {
  id: string;
  customer: string;
  billingType: "PIX" | "BOLETO";
  value: number;
  cycle: "MONTHLY";
  nextDueDate: string;
  externalReference?: string;
};

export type ReconciliationPayment = {
  id: string;
  customer?: string;
  subscription?: string;
  billingType: "PIX" | "BOLETO";
  status: string;
  dueDate: string;
  value: number;
  paymentDate?: string;
  confirmedDate?: string;
  externalReference?: string;
};

export type ReconciliationLink = {
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerPaymentId?: string;
};

export type ExistingCheckoutReconciliationInput = {
  link: ReconciliationLink;
  externalReference: string;
  legacyLinkExternalReference?: string;
  expectedValueCents: number;
};

export type ExistingCheckoutReconciliationPorts = {
  getSubscription(id: string): Promise<ReconciliationSubscription>;
  listPayments(subscriptionId: string): Promise<ReconciliationPayment[]>;
  savePaymentLink(payment: ReconciliationPayment): Promise<void>;
};

export type SubscriptionConflictField =
  | "providerSubscriptionId"
  | "providerCustomerId"
  | "externalReference"
  | "cycle"
  | "value";

export type SafeConflictDetails = Record<string, string | number>;

export function maskProviderIdentifier(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{7,100}$/.test(normalized)) return "<redacted>";
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
}

function safeExternalReference(value: string | undefined): string {
  return value && /^subscription:[a-f0-9]{24}$/.test(value)
    ? value
    : "<redacted>";
}

export class BillingReconciliationError extends Error {
  readonly code:
    | "PROVIDER_LINK_INVALID"
    | "PROVIDER_SUBSCRIPTION_CONFLICT"
    | "PROVIDER_PAYMENT_CONFLICT";
  readonly conflictField?: SubscriptionConflictField;
  readonly safeDetails?: SafeConflictDetails;

  constructor(
    code: BillingReconciliationError["code"],
    conflictField?: SubscriptionConflictField,
    safeDetails?: SafeConflictDetails,
  ) {
    super(code);
    this.code = code;
    this.conflictField = conflictField;
    this.safeDetails = safeDetails;
    this.name = "BillingReconciliationError";
  }
}

function sameMoney(value: number, expectedValueCents: number): boolean {
  return Math.round(value * 100) === expectedValueCents;
}

function compatiblePayment(
  payment: ReconciliationPayment,
  subscriptionId: string,
  customerId: string,
  expectedValueCents: number,
): boolean {
  return payment.subscription === subscriptionId &&
    payment.customer === customerId &&
    (payment.billingType === "PIX" || payment.billingType === "BOLETO") &&
    sameMoney(payment.value, expectedValueCents);
}

export async function reconcileExistingCheckout(
  input: ExistingCheckoutReconciliationInput,
  ports: ExistingCheckoutReconciliationPorts,
) {
  const customerId = input.link.providerCustomerId;
  const subscriptionId = input.link.providerSubscriptionId;
  if (!customerId?.startsWith("cus_") || !subscriptionId?.startsWith("sub_")) {
    throw new BillingReconciliationError("PROVIDER_LINK_INVALID");
  }

  const subscription = await ports.getSubscription(subscriptionId);
  if (subscription.id !== subscriptionId) {
    throw new BillingReconciliationError(
      "PROVIDER_SUBSCRIPTION_CONFLICT",
      "providerSubscriptionId",
      {
        expectedProviderSubscriptionId: maskProviderIdentifier(subscriptionId),
        actualProviderSubscriptionId: maskProviderIdentifier(subscription.id),
      },
    );
  }
  if (subscription.customer !== customerId) {
    throw new BillingReconciliationError(
      "PROVIDER_SUBSCRIPTION_CONFLICT",
      "providerCustomerId",
      {
        expectedProviderCustomerId: maskProviderIdentifier(customerId),
        actualProviderCustomerId: maskProviderIdentifier(subscription.customer),
      },
    );
  }
  const externalReferenceMatches =
    subscription.externalReference === input.externalReference ||
    (input.legacyLinkExternalReference !== undefined &&
      subscription.externalReference === input.legacyLinkExternalReference);
  if (!externalReferenceMatches) {
    throw new BillingReconciliationError(
      "PROVIDER_SUBSCRIPTION_CONFLICT",
      "externalReference",
      {
        expectedExternalReference: safeExternalReference(input.externalReference),
        actualExternalReference: safeExternalReference(subscription.externalReference),
      },
    );
  }
  if (subscription.cycle !== "MONTHLY") {
    throw new BillingReconciliationError(
      "PROVIDER_SUBSCRIPTION_CONFLICT",
      "cycle",
      { expectedCycle: "MONTHLY", actualCycle: String(subscription.cycle) },
    );
  }
  if (!sameMoney(subscription.value, input.expectedValueCents)) {
    throw new BillingReconciliationError(
      "PROVIDER_SUBSCRIPTION_CONFLICT",
      "value",
      {
        expectedValueCents: input.expectedValueCents,
        actualValueCents: Math.round(subscription.value * 100),
      },
    );
  }

  const payments = await ports.listPayments(subscriptionId);
  if (payments.some((payment) =>
    payment.subscription !== subscriptionId || payment.customer !== customerId
  )) {
    throw new BillingReconciliationError("PROVIDER_PAYMENT_CONFLICT");
  }

  let payment: ReconciliationPayment | null = null;
  if (input.link.providerPaymentId) {
    payment = payments.find((item) => item.id === input.link.providerPaymentId) ?? null;
    if (
      !payment ||
      !compatiblePayment(payment, subscriptionId, customerId, input.expectedValueCents)
    ) {
      throw new BillingReconciliationError("PROVIDER_PAYMENT_CONFLICT");
    }
  } else {
    const candidates = payments.filter((item) =>
      ["PENDING", "OVERDUE"].includes(item.status) &&
      compatiblePayment(item, subscriptionId, customerId, input.expectedValueCents)
    );
    if (candidates.length > 1) {
      throw new BillingReconciliationError("PROVIDER_PAYMENT_CONFLICT");
    }
    payment = candidates[0] ?? null;
    if (payment) await ports.savePaymentLink(payment);
  }

  const orderedPayments = [...payments].sort((left, right) =>
    right.dueDate.localeCompare(left.dueDate)
  );
  const pendingPayment = orderedPayments.find((item) =>
    item.id === payment?.id && ["PENDING", "OVERDUE"].includes(item.status)
  ) ?? null;

  return { subscription, payments: orderedPayments, payment, pendingPayment };
}
