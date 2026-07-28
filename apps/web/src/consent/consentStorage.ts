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

export function readConsentRecord(storage: Pick<Storage, "getItem"> = window.localStorage) {
  try {
    return parseConsentRecord(storage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistConsentRecord(
  record: ConsentRecord,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): boolean {
  try {
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
