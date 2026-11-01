import type { Document } from "mongodb";
import { OFFICIAL_PRODUCT_NAME } from "./product-identity.ts";

export const PLATFORM_BRANDING = {
  logoUrl: null as string | null,
  primaryColor: "#f97316",
  secondaryColor: "#0f172a",
  accentColor: "#2563eb",
  source: "platform" as const,
  productName: OFFICIAL_PRODUCT_NAME,
  displayName: OFFICIAL_PRODUCT_NAME,
};

export type BrandingInput = {
  logoUrl?: string | null;
  logoPathname?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  displayName?: string | null;
};

export type EffectiveBranding = Omit<typeof PLATFORM_BRANDING, "source" | "displayName"> & {
  source: "platform" | "company" | "unit";
  displayName: string;
};

export const BRANDING_LOGO_MAX_BYTES = 512 * 1024;
export const BRANDING_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 60;

export type DisplayNameValidation =
  | { valid: true; value: string | null }
  | { valid: false; error: string };

export function validateDisplayName(value: unknown): DisplayNameValidation {
  if (value === null) return { valid: true, value: null };
  if (typeof value !== "string") {
    return { valid: false, error: "Nome interno inválido." };
  }
  const normalized = value.trim();
  if (
    normalized.length < DISPLAY_NAME_MIN_LENGTH ||
    normalized.length > DISPLAY_NAME_MAX_LENGTH
  ) {
    return {
      valid: false,
      error: `O nome interno deve ter entre ${DISPLAY_NAME_MIN_LENGTH} e ${DISPLAY_NAME_MAX_LENGTH} caracteres.`,
    };
  }
  if (/[<>]/.test(normalized)) {
    return { valid: false, error: "O nome interno deve ser texto simples, sem HTML." };
  }
  return { valid: true, value: normalized };
}

export function isSafeBrandColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function channel(value: string, offset: number): number {
  return Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
}

function luminance(color: string): number {
  const values = [channel(color, 1), channel(color, 3), channel(color, 5)].map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

export function contrastText(color: string): "#ffffff" | "#0f172a" {
  if (!isSafeBrandColor(color)) return "#ffffff";
  const whiteContrast = 1.05 / (luminance(color) + 0.05);
  return whiteContrast >= 4.5 ? "#ffffff" : "#0f172a";
}

export function sanitizeBrandingInput(value: unknown): BrandingInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const colors = ["primaryColor", "secondaryColor", "accentColor"] as const;
  const result: BrandingInput = {};
  for (const key of colors) {
    if (item[key] !== undefined) {
      if (!isSafeBrandColor(item[key])) return null;
      result[key] = item[key];
    }
  }
  return result;
}

function validBranding(value: unknown): BrandingInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const result: BrandingInput = {};
  if (typeof item.logoUrl === "string" && /^https:\/\//.test(item.logoUrl)) {
    result.logoUrl = item.logoUrl;
  }
  for (const key of ["primaryColor", "secondaryColor", "accentColor"] as const) {
    if (isSafeBrandColor(item[key])) result[key] = item[key];
  }
  const displayName = validateDisplayName(item.displayName);
  if (displayName.valid && displayName.value) result.displayName = displayName.value;
  return Object.keys(result).length ? result : null;
}

export function resolveEffectiveBranding(
  company: (Document & { branding?: unknown }) | null,
  school: (Document & { branding?: unknown }) | null,
): EffectiveBranding {
  const companyValue = company?.branding && typeof company.branding === "object"
    ? company.branding as Record<string, unknown>
    : null;
  const companyBranding = validBranding(companyValue);
  const unitAllowed = companyValue?.allowUnitBranding === true;
  const unitDisplayNameAllowed = companyValue?.allowUnitDisplayName === true;
  const unitBranding = unitAllowed ? validBranding(school?.branding) : null;
  const unitDisplayName = unitDisplayNameAllowed
    ? validBranding(school?.branding)?.displayName
    : null;
  return {
    logoUrl: unitBranding?.logoUrl ?? companyBranding?.logoUrl ?? PLATFORM_BRANDING.logoUrl,
    primaryColor: unitBranding?.primaryColor ?? companyBranding?.primaryColor ?? PLATFORM_BRANDING.primaryColor,
    secondaryColor: unitBranding?.secondaryColor ?? companyBranding?.secondaryColor ?? PLATFORM_BRANDING.secondaryColor,
    accentColor: unitBranding?.accentColor ?? companyBranding?.accentColor ?? PLATFORM_BRANDING.accentColor,
    source: unitBranding || unitDisplayName ? "unit" : companyBranding ? "company" : "platform",
    productName: PLATFORM_BRANDING.productName,
    displayName: unitDisplayName ?? companyBranding?.displayName ?? PLATFORM_BRANDING.displayName,
  };
}

export function detectBrandingImageType(bytes: Uint8Array): (typeof BRANDING_ALLOWED_MIME)[number] | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}
