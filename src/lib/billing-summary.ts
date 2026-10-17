export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Pago",
  CONFIRMED: "Confirmado",
  PENDING: "Pendente",
  OVERDUE: "Em atraso",
  REFUNDED: "Reembolsado",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  pending: "Pagamento pendente",
  past_due: "Em atraso",
};

export function paymentStatusLabel(status: unknown): string {
  return typeof status === "string"
    ? PAYMENT_STATUS_LABELS[status] ?? "Em processamento"
    : "Indisponível";
}

export function subscriptionStatusLabel(status: unknown): string {
  return typeof status === "string"
    ? SUBSCRIPTION_STATUS_LABELS[status] ?? "Indisponível"
    : "Sem assinatura";
}

export function billingTypeLabel(type: unknown): string {
  if (type === "BOLETO") return "Boleto";
  if (type === "PIX") return "Pix";
  if (type === "CREDIT_CARD") return "Cartão";
  return "Não informado";
}

export function isPendingQuantityChange(change: unknown): boolean {
  return Boolean(
    change &&
    typeof change === "object" &&
    (change as Record<string, unknown>).status === "pending_payment",
  );
}

