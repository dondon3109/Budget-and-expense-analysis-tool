export const RELEASE_AWARENESS_STORAGE_KEY = "zoption-release-awareness";
const RELEASE_AWARENESS_SCHEMA_VERSION = 1;

export interface ReleaseAwarenessRecord {
  schemaVersion: typeof RELEASE_AWARENESS_SCHEMA_VERSION;
  acknowledgedVersion: string;
  acknowledgedAt: string;
}

function isReleaseAwarenessRecord(value: unknown): value is ReleaseAwarenessRecord {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === RELEASE_AWARENESS_SCHEMA_VERSION &&
    typeof record.acknowledgedVersion === "string" &&
    record.acknowledgedVersion.length > 0 &&
    typeof record.acknowledgedAt === "string" &&
    record.acknowledgedAt.length > 0 &&
    !Number.isNaN(Date.parse(record.acknowledgedAt))
  );
}

export function parseReleaseAwarenessRecord(value: string | null): ReleaseAwarenessRecord | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isReleaseAwarenessRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readReleaseAwarenessRecord(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): ReleaseAwarenessRecord | null {
  try {
    return parseReleaseAwarenessRecord(storage.getItem(RELEASE_AWARENESS_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistReleaseAwarenessRecord(
  version: string,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): boolean {
  const record: ReleaseAwarenessRecord = {
    schemaVersion: RELEASE_AWARENESS_SCHEMA_VERSION,
    acknowledgedVersion: version,
    acknowledgedAt: new Date().toISOString(),
  };

  try {
    storage.setItem(RELEASE_AWARENESS_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function hasAcknowledgedRelease(version: string, value: string | null): boolean {
  return parseReleaseAwarenessRecord(value)?.acknowledgedVersion === version;
}
