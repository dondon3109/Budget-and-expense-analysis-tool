export const CONSENT_STORAGE_KEY = "zoption-cookie-consent";
export const CONSENT_SCHEMA_VERSION = 1;
export const CONSENT_POLICY_VERSION = "2026-07-28";

export const OPTIONAL_CONSENT_CATEGORIES = ["analytics", "marketing"] as const;

export type OptionalConsentCategory = (typeof OPTIONAL_CONSENT_CATEGORIES)[number];
export type ConsentDecisionSource = "accept_all" | "reject_all" | "custom";

export interface ConsentPreferences {
  analytics: boolean;
  marketing: boolean;
}

export interface ConsentRecord {
  schemaVersion: typeof CONSENT_SCHEMA_VERSION;
  policyVersion: typeof CONSENT_POLICY_VERSION;
  decidedAt: string;
  source: ConsentDecisionSource;
  preferences: ConsentPreferences;
}

export const DENIED_OPTIONAL_CONSENT: Readonly<ConsentPreferences> = Object.freeze({
  analytics: false,
  marketing: false,
});

export function createConsentRecord(
  preferences: ConsentPreferences,
  source: ConsentDecisionSource,
  decidedAt = new Date().toISOString(),
): ConsentRecord {
  return {
    schemaVersion: CONSENT_SCHEMA_VERSION,
    policyVersion: CONSENT_POLICY_VERSION,
    decidedAt,
    source,
    preferences: { ...preferences },
  };
}
