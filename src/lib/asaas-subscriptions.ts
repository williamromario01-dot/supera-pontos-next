import "server-only";

import {
  ASAAS_USER_AGENT,
  AsaasCustomerRequestError,
  getAsaasConfig,
} from "@/lib/asaas";

const REQUEST_TIMEOUT_MS = 15_000;

export interface AsaasSubscription {
  id: string;
  customer: string;
  billingType: "PIX" | "BOLETO";
  value: number;
  status?: string;
  nextDueDate: string;
  endDate?: string | null;
  cycle: "MONTHLY";
  externalReference?: string;
}

export interface CreateAsaasSubscriptionInput {
  customer: string;
  billingType: "PIX" | "BOLETO";
  value: number;
  nextDueDate: string;
  endDate?: string | null;
  cycle: "MONTHLY";
  description: string;
  externalReference: string;
}

export interface AsaasPayment {
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
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
}

async function requestAsaas(
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const config = getAsaasConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(config.baseUrl + path, {
      ...init,
      headers: {
        accept: "application/json",
        access_token: config.apiKey,
        "User-Agent": ASAAS_USER_AGENT,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      signal: controller.signal,
    });
    console.info("Asaas subscription request completed:", {
      method: init.method,
      status: response.status,
    });
    if (!response.ok) {
      const details = await readErrorDetails(response);
      throw new AsaasCustomerRequestError(
        "ASAAS_HTTP_ERROR",
        response.status,
        response.status >= 500,
        details,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new AsaasCustomerRequestError(
        "ASAAS_INVALID_RESPONSE",
        response.status,
        true,
      );
    }
  } catch (error) {
    if (error instanceof AsaasCustomerRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AsaasCustomerRequestError("ASAAS_TIMEOUT", null, true);
    }
    throw new AsaasCustomerRequestError("ASAAS_NETWORK_ERROR", null, true);
  } finally {
    clearTimeout(timeout);
  }
}

function safeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().slice(0, 100);
  return /^[A-Za-z0-9_.:[\]-]+$/.test(candidate) ? candidate : undefined;
}

function safeDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = value.trim().slice(0, 500)
    .replace(/(access_token|authorization|cookie|password|token)\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "<redacted-email>")
    .replace(/\b\d{10,14}\b/g, "<redacted-document-or-phone>");
  return sanitized || undefined;
}

async function readErrorDetails(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).errors)
      ? (parsed as Record<string, unknown>).errors as unknown[]
      : [parsed];
  return candidates.slice(0, 10).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const detail = value as Record<string, unknown>;
    const result = {
      code: safeIdentifier(detail.code),
      description: safeDescription(detail.description ?? detail.message ?? detail.error),
      field: safeIdentifier(detail.field ?? detail.param),
    };
    return result.code || result.description || result.field ? [result] : [];
  });
}

function parseSubscription(value: unknown): AsaasSubscription | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" || !item.id.startsWith("sub_") ||
    typeof item.customer !== "string" || !item.customer.startsWith("cus_") ||
    (item.billingType !== "PIX" && item.billingType !== "BOLETO") || typeof item.value !== "number" ||
    typeof item.nextDueDate !== "string" || item.cycle !== "MONTHLY"
  ) return null;
  return {
    id: item.id,
    customer: item.customer,
    billingType: item.billingType,
    value: item.value,
    status: typeof item.status === "string" ? item.status : undefined,
    nextDueDate: item.nextDueDate,
    endDate: typeof item.endDate === "string" || item.endDate === null
      ? item.endDate
      : undefined,
    cycle: item.cycle,
    externalReference: typeof item.externalReference === "string"
      ? item.externalReference
      : undefined,
  };
}

export async function findAsaasSubscriptions(
  externalReference: string,
  customer: string,
): Promise<AsaasSubscription[]> {
  const query = new URLSearchParams({ externalReference, customer, limit: "100" });
  const response = await requestAsaas(`/subscriptions?${query}`, { method: "GET" });
  const data = response && typeof response === "object"
    ? (response as Record<string, unknown>).data
    : undefined;
  if (!Array.isArray(data)) {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  return data.map(parseSubscription).filter(
    (item): item is AsaasSubscription => item !== null,
  );
}

export async function getAsaasSubscription(
  subscriptionId: string,
): Promise<AsaasSubscription> {
  const response = await requestAsaas(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
  );
  const subscription = parseSubscription(response);
  if (!subscription) {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  return subscription;
}

export async function updateAsaasSubscriptionValue(
  subscriptionId: string,
  value: number,
): Promise<AsaasSubscription> {
  const response = await requestAsaas(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ value, updatePendingPayments: true }),
    },
  );
  const subscription = parseSubscription(response);
  if (!subscription) {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  return subscription;
}

export async function updateAsaasSubscriptionEndDate(
  subscriptionId: string,
  endDate: string | null,
): Promise<AsaasSubscription> {
  const response = await requestAsaas(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ endDate }),
    },
  );
  const subscription = parseSubscription(response);
  if (!subscription) {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  return subscription;
}

export async function reactivateAsaasSubscription(
  subscriptionId: string,
  input: { value: number; nextDueDate: string },
): Promise<AsaasSubscription> {
  const response = await requestAsaas(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        status: "ACTIVE",
        endDate: null,
        value: input.value,
        nextDueDate: input.nextDueDate,
        updatePendingPayments: false,
      }),
    },
  );
  const subscription = parseSubscription(response);
  if (!subscription) {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  return subscription;
}

export async function createAsaasSubscription(
  input: CreateAsaasSubscriptionInput,
): Promise<AsaasSubscription> {
  const response = await requestAsaas("/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const subscription = parseSubscription(response);
  if (!subscription) {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  return subscription;
}

function parsePayment(value: unknown): AsaasPayment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" || !item.id.startsWith("pay_") ||
    (item.billingType !== "PIX" && item.billingType !== "BOLETO") || typeof item.status !== "string" ||
    typeof item.dueDate !== "string" || typeof item.value !== "number"
  ) return null;
  return {
    id: item.id,
    customer: typeof item.customer === "string" ? item.customer : undefined,
    subscription: typeof item.subscription === "string" ? item.subscription : undefined,
    billingType: item.billingType,
    status: item.status,
    dueDate: item.dueDate,
    value: item.value,
    paymentDate: typeof item.paymentDate === "string" ? item.paymentDate : undefined,
    confirmedDate: typeof item.confirmedDate === "string" ? item.confirmedDate : undefined,
    externalReference: typeof item.externalReference === "string"
      ? item.externalReference
      : undefined,
  };
}

export async function getAsaasPayment(paymentId: string): Promise<AsaasPayment> {
  const response = await requestAsaas(
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
  );
  const payment = parsePayment(response);
  if (!payment) {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  return payment;
}

export async function listAsaasSubscriptionPayments(
  subscriptionId: string,
): Promise<AsaasPayment[]> {
  const response = await requestAsaas(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=100`,
    { method: "GET" },
  );
  const data = response && typeof response === "object"
    ? (response as Record<string, unknown>).data
    : undefined;
  if (!Array.isArray(data)) {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  return data.map(parsePayment).filter((item): item is AsaasPayment => item !== null);
}

export async function getAsaasPaymentPixQrCode(
  paymentId: string,
): Promise<AsaasPixQrCode> {
  const response = await requestAsaas(
    `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
    { method: "GET" },
  );
  if (!response || typeof response !== "object") {
    throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  }
  const item = response as Record<string, unknown>;
  if (
    typeof item.encodedImage !== "string" ||
    item.encodedImage.length < 16 ||
    item.encodedImage.length > 2_000_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(item.encodedImage) ||
    typeof item.payload !== "string" ||
    item.payload.length < 10 ||
    item.payload.length > 10_000
  ) throw new AsaasCustomerRequestError("ASAAS_INVALID_RESPONSE", 200, true);
  return {
    encodedImage: item.encodedImage,
    payload: item.payload,
    expirationDate: typeof item.expirationDate === "string"
      ? item.expirationDate
      : undefined,
  };
}
