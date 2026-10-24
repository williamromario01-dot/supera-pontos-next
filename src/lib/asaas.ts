import "server-only";

import { ASAAS_BASE_URLS, parseAsaasEnvironment, type AsaasEnvironment } from "@/lib/asaas-config-core";
export type { AsaasEnvironment } from "@/lib/asaas-config-core";
export const ASAAS_USER_AGENT = "SUPERPONTOS/1.0";
const ASAAS_REQUEST_TIMEOUT_MS = 15_000;

export interface AsaasConfig {
  environment: AsaasEnvironment;
  baseUrl: string;
  apiKey: string;
}

export interface AsaasCustomer {
  id: string;
  cpfCnpj?: string;
  externalReference?: string;
}

export interface CreateAsaasCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  externalReference: string;
  notificationDisabled: true;
}

export interface AsaasErrorDetail {
  code?: string;
  description?: string;
  field?: string;
}

export class AsaasCustomerRequestError extends Error {
  constructor(
    public readonly code:
      | "ASAAS_TIMEOUT"
      | "ASAAS_NETWORK_ERROR"
      | "ASAAS_HTTP_ERROR"
      | "ASAAS_INVALID_RESPONSE",
    public readonly status: number | null,
    public readonly inconclusive: boolean,
    public readonly details: readonly AsaasErrorDetail[] = [],
  ) {
    super(code);
    this.name = "AsaasCustomerRequestError";
  }
}

function sanitizeAsaasDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = value
    .trim()
    .slice(0, 500)
    .replace(
      /(access_token|authorization|cookie|passwordHash|password|token)\s*[:=]\s*[^\s,;]+/gi,
      "$1=<redacted>",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "<redacted-email>")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "<redacted-document>")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "<redacted-document>")
    .replace(/\b\d{10,14}\b/g, "<redacted-document-or-phone>")
    .replace(/\+?\d[\d\s()./-]{8,}\d/g, (candidate) => {
      const digitCount = candidate.replace(/\D/g, "").length;
      return digitCount >= 10 && digitCount <= 14
        ? "<redacted-document-or-phone>"
        : candidate;
    });
  return sanitized || undefined;
}

function sanitizeAsaasIdentifier(
  value: unknown,
  pattern: RegExp,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().slice(0, 100);
  return candidate && pattern.test(candidate) ? candidate : undefined;
}

function parseAsaasErrorDetail(value: unknown): AsaasErrorDetail | null {
  if (typeof value === "string") {
    const description = sanitizeAsaasDescription(value);
    return description ? { description } : null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const code = sanitizeAsaasIdentifier(
    record.code,
    /^[A-Za-z0-9_.:-]+$/,
  );
  const description = sanitizeAsaasDescription(
    record.description ?? record.message ?? record.error,
  );
  const field = sanitizeAsaasIdentifier(
    record.field ?? record.param,
    /^[A-Za-z0-9_.\[\]-]+$/,
  );

  return code || description || field
    ? { code, description, field }
    : null;
}

async function readAsaasErrorDetails(
  response: Response,
): Promise<AsaasErrorDetail[]> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return [];
  }
  if (!text.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  let candidates: unknown[];
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    candidates = Array.isArray(record.errors)
      ? record.errors
      : [record];
  } else {
    candidates = [parsed];
  }

  return candidates
    .slice(0, 10)
    .map(parseAsaasErrorDetail)
    .filter((detail): detail is AsaasErrorDetail => detail !== null);
}

export function getAsaasEnvironment(env: NodeJS.ProcessEnv = process.env): AsaasEnvironment {
  return parseAsaasEnvironment(env.ASAAS_ENV?.trim());
}

export function getAsaasBaseUrl(): string {
  return ASAAS_BASE_URLS[getAsaasEnvironment()];
}

export function getAsaasConfig(): AsaasConfig {
  const environment = getAsaasEnvironment();
  const apiKey = process.env.ASAAS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ASAAS_API_KEY_NOT_CONFIGURED");
  }
  return { environment, baseUrl: ASAAS_BASE_URLS[environment], apiKey };
}

async function requestAsaasCustomer(
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const config = getAsaasConfig();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ASAAS_REQUEST_TIMEOUT_MS,
  );

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

    console.info("Asaas customer request completed:", {
      method: init.method,
      status: response.status,
    });

    if (!response.ok) {
      const details = await readAsaasErrorDetails(response);
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
    throw new AsaasCustomerRequestError(
      "ASAAS_NETWORK_ERROR",
      null,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseCustomer(value: unknown): AsaasCustomer | null {
  if (!value || typeof value !== "object") return null;
  const customer = value as Record<string, unknown>;
  if (
    typeof customer.id !== "string" ||
    !customer.id.startsWith("cus_")
  ) {
    return null;
  }

  return {
    id: customer.id,
    cpfCnpj:
      typeof customer.cpfCnpj === "string"
        ? customer.cpfCnpj
        : undefined,
    externalReference:
      typeof customer.externalReference === "string"
        ? customer.externalReference
        : undefined,
  };
}

export async function findAsaasCustomersByExternalReference(
  externalReference: string,
): Promise<AsaasCustomer[]> {
  const query = new URLSearchParams({
    externalReference,
    limit: "100",
  });
  const response = await requestAsaasCustomer(
    "/customers?" + query.toString(),
    { method: "GET" },
  );

  if (!response || typeof response !== "object") {
    throw new AsaasCustomerRequestError(
      "ASAAS_INVALID_RESPONSE",
      200,
      true,
    );
  }

  const data = (response as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    throw new AsaasCustomerRequestError(
      "ASAAS_INVALID_RESPONSE",
      200,
      true,
    );
  }

  return data
    .map(parseCustomer)
    .filter(
      (customer): customer is AsaasCustomer => customer !== null,
    );
}

export async function createAsaasCustomer(
  input: CreateAsaasCustomerInput,
): Promise<AsaasCustomer> {
  const response = await requestAsaasCustomer("/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const customer = parseCustomer(response);
  if (!customer) {
    throw new AsaasCustomerRequestError(
      "ASAAS_INVALID_RESPONSE",
      200,
      true,
    );
  }
  return customer;
}
