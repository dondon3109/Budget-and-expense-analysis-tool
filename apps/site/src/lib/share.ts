import { API_URL, REQUEST_TIMEOUT_MS } from "./api";

// The share page's data layer. The site cannot bundle zod (see AGENTS.md), so the public share
// payload is checked by hand here; the Worker validates the same shape with
// `publicShareLinkSchema` before it ever stores a snapshot.

export interface SharedTransaction {
  kind: "transaction";
  direction: "income" | "expense";
  amountMinor: number;
  currency: string;
  description: string | null;
  categoryName: string | null;
  date: string | null;
  note: string | null;
}

export interface SharedBalance {
  kind: "balance";
  amountMinor: number;
  currency: string;
  asOf: string;
}

export interface PublicShare {
  snapshot: SharedTransaction | SharedBalance;
  sharerName: string | null;
  expiresAt: string | null;
}

const TOKEN = /^[A-Za-z0-9_-]{22}$/u;

/** The token from `/s#<token>`, or null when the fragment cannot be one. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.replace(/^#/u, "");
  return TOKEN.test(token) ? token : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const optionalText = (value: unknown) => value === null || typeof value === "string";

function isSnapshot(value: unknown): value is PublicShare["snapshot"] {
  if (!isRecord(value)) return false;
  if (!Number.isInteger(value.amountMinor) || typeof value.currency !== "string") return false;
  if (value.kind === "balance") return typeof value.asOf === "string";
  return (
    value.kind === "transaction" &&
    (value.direction === "income" || value.direction === "expense") &&
    ["description", "categoryName", "date", "note"].every((key) => optionalText(value[key]))
  );
}

export function parsePublicShare(value: unknown): PublicShare | null {
  if (!isRecord(value) || !isSnapshot(value.snapshot)) return null;
  if (!optionalText(value.sharerName) || !optionalText(value.expiresAt)) return null;
  return {
    snapshot: value.snapshot,
    sharerName: value.sharerName,
    expiresAt: value.expiresAt,
  };
}

/** Null for a missing, revoked, or expired link; throws only when the request itself failed. */
export async function fetchPublicShare(token: string): Promise<PublicShare | null> {
  const response = await fetch(`${API_URL}/api/public/shares/${token}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Share request failed with ${response.status}.`);
  return parsePublicShare(await response.json());
}

/**
 * Money is stored as hundredths of the major unit for every currency. Whole units, the same
 * rounding the app uses, so a shared figure matches what the owner sees.
 */
export function formatShareMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${Math.round(amountMinor / 100)}`;
  }
}

export function formatShareDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
