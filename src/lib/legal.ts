export const TERMS_VERSION = "1.0";
export const PRIVACY_VERSION = "1.0";

type LegalAcceptanceLike = {
  termsVersion?: unknown;
  privacyVersion?: unknown;
} | null | undefined;

export function requiresLegalReacceptance(acceptance: LegalAcceptanceLike): boolean {
  return acceptance?.termsVersion !== TERMS_VERSION || acceptance?.privacyVersion !== PRIVACY_VERSION;
}
