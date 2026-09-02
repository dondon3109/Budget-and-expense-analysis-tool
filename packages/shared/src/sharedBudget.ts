export interface SharedEnvelopeItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  allocatedLimitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  percentUsed: number;
}

export interface SharedBudgetPayload {
  version: 1;
  shareId: string;
  title: string;
  month: string;
  currency: "PHP";
  envelopes: SharedEnvelopeItem[];
  totalAllocatedMinor: number;
  totalSpentMinor: number;
  totalRemainingMinor: number;
  totalPercentUsed: number;
  ownerDisplayName?: string;
  notes?: string;
  expiresAt?: string | null;
  createdAt: string;
}

export interface CreateShareTokenOptions {
  title: string;
  month: string;
  currency?: "PHP";
  categories: {
    id: string;
    name: string;
    color?: string;
    allocatedLimitMinor: number;
    spentMinor: number;
  }[];
  ownerDisplayName?: string;
  notes?: string;
  expiresInDays?: number;
}

export interface DecodeShareTokenResult {
  valid: boolean;
  payload?: SharedBudgetPayload;
  error?: "expired" | "malformed" | "invalid_signature" | "unsupported_version";
}

const TOKEN_TAG = "zsb1";
const DEFAULT_CATEGORY_COLOR = "#64748b";
const DAY_MS = 86_400_000;

function percentUsed(spentMinor: number, allocatedLimitMinor: number): number {
  return allocatedLimitMinor > 0 ? Math.round((spentMinor / allocatedLimitMinor) * 100) : 0;
}

function createShareId(): string {
  const randomValues = new Uint8Array(12);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Invalid base64url payload.");
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSharedEnvelopeItem(value: unknown): value is SharedEnvelopeItem {
  return (
    isObject(value) &&
    isString(value.categoryId) &&
    isString(value.categoryName) &&
    isString(value.categoryColor) &&
    isNumber(value.allocatedLimitMinor) &&
    isNumber(value.spentMinor) &&
    isNumber(value.remainingMinor) &&
    isNumber(value.percentUsed)
  );
}

function parseSharedBudgetPayload(
  value: unknown,
): SharedBudgetPayload | "unsupported_version" | null {
  if (!isObject(value)) return null;
  if (value.version !== 1) return "unsupported_version";
  if (
    !isString(value.shareId) ||
    !isString(value.title) ||
    !isString(value.month) ||
    value.currency !== "PHP" ||
    !Array.isArray(value.envelopes) ||
    !value.envelopes.every(isSharedEnvelopeItem) ||
    !isNumber(value.totalAllocatedMinor) ||
    !isNumber(value.totalSpentMinor) ||
    !isNumber(value.totalRemainingMinor) ||
    !isNumber(value.totalPercentUsed) ||
    !isString(value.createdAt)
  ) {
    return null;
  }
  if (value.ownerDisplayName !== undefined && !isString(value.ownerDisplayName)) return null;
  if (value.notes !== undefined && !isString(value.notes)) return null;
  if (value.expiresAt !== undefined && value.expiresAt !== null && !isString(value.expiresAt)) {
    return null;
  }

  return {
    version: 1,
    shareId: value.shareId,
    title: value.title,
    month: value.month,
    currency: "PHP",
    envelopes: value.envelopes,
    totalAllocatedMinor: value.totalAllocatedMinor,
    totalSpentMinor: value.totalSpentMinor,
    totalRemainingMinor: value.totalRemainingMinor,
    totalPercentUsed: value.totalPercentUsed,
    ...(value.ownerDisplayName === undefined ? {} : { ownerDisplayName: value.ownerDisplayName }),
    ...(value.notes === undefined ? {} : { notes: value.notes }),
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
    createdAt: value.createdAt,
  };
}

export function createSharedBudgetPayload(options: CreateShareTokenOptions): SharedBudgetPayload {
  const envelopes = options.categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    categoryColor: category.color ?? DEFAULT_CATEGORY_COLOR,
    allocatedLimitMinor: category.allocatedLimitMinor,
    spentMinor: category.spentMinor,
    remainingMinor: Math.max(0, category.allocatedLimitMinor - category.spentMinor),
    percentUsed: percentUsed(category.spentMinor, category.allocatedLimitMinor),
  }));
  const totalAllocatedMinor = envelopes.reduce((sum, item) => sum + item.allocatedLimitMinor, 0);
  const totalSpentMinor = envelopes.reduce((sum, item) => sum + item.spentMinor, 0);
  const totalRemainingMinor = Math.max(0, totalAllocatedMinor - totalSpentMinor);

  return {
    version: 1,
    shareId: createShareId(),
    title: options.title,
    month: options.month,
    currency: options.currency ?? "PHP",
    envelopes,
    totalAllocatedMinor,
    totalSpentMinor,
    totalRemainingMinor,
    totalPercentUsed: percentUsed(totalSpentMinor, totalAllocatedMinor),
    ...(options.ownerDisplayName === undefined
      ? {}
      : { ownerDisplayName: options.ownerDisplayName }),
    ...(options.notes === undefined ? {} : { notes: options.notes }),
    ...(options.expiresInDays === undefined
      ? {}
      : { expiresAt: new Date(Date.now() + options.expiresInDays * DAY_MS).toISOString() }),
    createdAt: new Date().toISOString(),
  };
}

export function encodeSharedBudgetToken(payload: SharedBudgetPayload): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${TOKEN_TAG}.${encodedPayload}.${checksum(`${TOKEN_TAG}.${encodedPayload}`)}`;
}

export function decodeSharedBudgetToken(token: string, nowIso?: string): DecodeShareTokenResult {
  const [tag, encodedPayload, providedChecksum, ...extra] = token.split(".");
  if (extra.length > 0 || !tag || !encodedPayload || !providedChecksum) {
    return { valid: false, error: "malformed" };
  }
  if (tag !== TOKEN_TAG)
    return { valid: false, error: /^zsb\d+$/u.test(tag) ? "unsupported_version" : "malformed" };
  if (providedChecksum !== checksum(`${tag}.${encodedPayload}`)) {
    return { valid: false, error: "invalid_signature" };
  }

  try {
    const parsedPayload = parseSharedBudgetPayload(JSON.parse(decodeBase64Url(encodedPayload)));
    if (parsedPayload === "unsupported_version")
      return { valid: false, error: "unsupported_version" };
    if (parsedPayload === null) return { valid: false, error: "malformed" };
    if (parsedPayload.expiresAt && parsedPayload.expiresAt < (nowIso ?? new Date().toISOString())) {
      return { valid: false, error: "expired" };
    }
    return { valid: true, payload: parsedPayload };
  } catch {
    return { valid: false, error: "malformed" };
  }
}

export function maskSensitiveDetails(payload: SharedBudgetPayload): SharedBudgetPayload {
  const envelopes = payload.envelopes.map((item) => ({
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    categoryColor: item.categoryColor,
    allocatedLimitMinor: item.allocatedLimitMinor,
    spentMinor: item.spentMinor,
    remainingMinor: item.remainingMinor,
    percentUsed: item.percentUsed,
  }));

  return {
    version: 1,
    shareId: payload.shareId,
    title: payload.title,
    month: payload.month,
    currency: payload.currency,
    envelopes,
    totalAllocatedMinor: payload.totalAllocatedMinor,
    totalSpentMinor: payload.totalSpentMinor,
    totalRemainingMinor: payload.totalRemainingMinor,
    totalPercentUsed: payload.totalPercentUsed,
    ...(payload.expiresAt === undefined ? {} : { expiresAt: payload.expiresAt }),
    createdAt: payload.createdAt,
  };
}
