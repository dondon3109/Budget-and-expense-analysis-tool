import {
  CONSENT_POLICY_VERSION,
  CONSENT_SCHEMA_VERSION,
  CONSENT_STORAGE_KEY,
  type ConsentRecord,
} from "./consent";

function isConsentRecord(value: unknown): value is ConsentRecord {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  const preferences = record.preferences;
  if (!preferences || typeof preferences !== "object") return false;

  const preferenceRecord = preferences as Record<string, unknown>;
  const validSource =
    record.source === "accept_all" || record.source === "reject_all" || record.source === "custom";
  const validDate =
    typeof record.decidedAt === "string" &&
    record.decidedAt.length > 0 &&
    !Number.isNaN(Date.parse(record.decidedAt));

  return (
    record.schemaVersion === CONSENT_SCHEMA_VERSION &&
    record.policyVersion === CONSENT_POLICY_VERSION &&
    validDate &&
    validSource &&
    typeof preferenceRecord.analytics === "boolean" &&
    typeof preferenceRecord.marketing === "boolean"
  );
}

export function parseConsentRecord(value: string | null): ConsentRecord | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isConsentRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The consent record lives in one first-party cookie scoped to the registrable domain, so
 * zoption.site and app.zoption.site read and write the same decision: a visitor who chose on
 * the public site is not asked again in the app, and a withdrawal on either applies to both.
 * Preview and local hosts keep a host-only cookie of their own.
 */
const SHARED_CONSENT_DOMAIN = "zoption.site";
const CONSENT_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function readConsentCookie(): string | null {
  for (const part of document.cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1 || part.slice(0, separator).trim() !== CONSENT_STORAGE_KEY) continue;
    return decodeURIComponent(part.slice(separator + 1));
  }
  return null;
}

function consentCookieAttributes(): string {
  const { hostname, protocol } = window.location;
  const shared =
    hostname === SHARED_CONSENT_DOMAIN || hostname.endsWith(`.${SHARED_CONSENT_DOMAIN}`);
  return [
    "Path=/",
    `Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    shared ? `Domain=${SHARED_CONSENT_DOMAIN}` : "",
    protocol === "https:" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Reads the shared decision. A record that only exists in this origin's localStorage (where
 * every decision lived before the cookie) is moved into the cookie on first read, so an
 * earlier choice carries over instead of asking again. Anything unreadable counts as no
 * decision.
 */
export function readConsentRecord(): ConsentRecord | null {
  if (typeof document === "undefined") return null;

  try {
    const record = parseConsentRecord(readConsentCookie());
    if (record) return record;
  } catch {
    // An unreadable cookie falls through to the earlier per-origin record.
  }

  try {
    const legacy = parseConsentRecord(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    if (legacy) persistConsentRecord(legacy);
    return legacy;
  } catch {
    return null;
  }
}

/** Saves the decision for both sites. Returns false when the browser refused the cookie. */
export function persistConsentRecord(record: ConsentRecord): boolean {
  const value = JSON.stringify(record);
  try {
    document.cookie = `${CONSENT_STORAGE_KEY}=${encodeURIComponent(value)}; ${consentCookieAttributes()}`;
    if (readConsentCookie() !== value) return false;
  } catch {
    return false;
  }
  try {
    // The earlier per-origin copy would otherwise come back once the cookie expires.
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // The cookie is read first, so a leftover copy cannot override it.
  }
  return true;
}
