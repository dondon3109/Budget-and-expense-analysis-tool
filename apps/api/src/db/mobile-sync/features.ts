import type {
  AccountType,
  MobileSyncChange,
  MobileSyncFeature,
  MobileSyncPushResult,
} from "@zoption/shared";

import type { Bindings } from "../../types";

export type MobileSyncFeatures = ReadonlySet<MobileSyncFeature>;

// The account types protocol version 1 shipped with; older installs reject any other value.
const PROTOCOL_V1_ACCOUNT_TYPES: readonly AccountType[] = [
  "cash",
  "checking",
  "savings",
  "credit",
  "other",
];
// Added by "account-types-v2"; "account-types-v3" clients also accept "ewallet".
const ACCOUNT_TYPES_V2: readonly AccountType[] = [
  ...PROTOCOL_V1_ACCOUNT_TYPES,
  "virtual",
  "investment",
  "receivable",
  "payable",
];

// D1 caps bound parameters per statement well above this; a pull page holds at most 200 rows.
const LINK_LOOKUP_CHUNK = 90;

type Payload = Record<string, unknown>;

/** What a transaction row links to beyond its stored change payload. */
interface TransactionLinks {
  debtId: string | null;
  authorUserId: string | null;
}

/** Whether the client needs anything read from the transaction rows themselves. */
function readsLinks(features: MobileSyncFeatures): boolean {
  return features.has("debt-links") || features.has("family-workspaces");
}

/** Reads the stored debt link and author of each transaction row. */
async function readTransactionLinks(
  env: Bindings,
  tenantId: string,
  transactionIds: string[],
): Promise<Map<string, TransactionLinks>> {
  const links = new Map<string, TransactionLinks>();
  const unique = [...new Set(transactionIds)];
  for (let start = 0; start < unique.length; start += LINK_LOOKUP_CHUNK) {
    const chunk = unique.slice(start, start + LINK_LOOKUP_CHUNK);
    const rows = await env.DB.prepare(
      `SELECT id, debt_id AS debtId, created_by_user_id AS authorUserId FROM transactions
       WHERE tenant_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`,
    )
      .bind(tenantId, ...chunk)
      .all<{ id: string; debtId: string | null; authorUserId: string | null }>();
    for (const row of rows.results) {
      links.set(row.id, { debtId: row.debtId, authorUserId: row.authorUserId });
    }
  }
  return links;
}

/**
 * Shapes one outgoing row for the client. The change log stores payloads without debt links or
 * authors, so a "debt-links" client gets the current link and a "family-workspaces" client the
 * author, both read from the row; a transfer's sit on its sending leg. Clients without
 * "account-types-v2" (or "-v3" for "ewallet") see newer account types as "other".
 */
function shapePayload(
  entityType: string,
  payload: Payload,
  features: MobileSyncFeatures,
  links: Map<string, TransactionLinks>,
): Payload {
  if (entityType === "budget" && !features.has("budget-scopes")) {
    const { occasionId: _occasionId, ...rest } = payload;
    return rest;
  }
  if (entityType === "account" && !features.has("account-types-v3")) {
    const type = payload.type as AccountType;
    const known = features.has("account-types-v2") ? ACCOUNT_TYPES_V2 : PROTOCOL_V1_ACCOUNT_TYPES;
    return known.includes(type) ? payload : { ...payload, type: "other" };
  }
  const linkId =
    entityType === "transaction"
      ? (payload.id as string)
      : entityType === "transfer"
        ? (payload.fromTransactionId as string)
        : null;
  if (!linkId) return payload;
  const link = links.get(linkId);
  return {
    ...payload,
    ...(features.has("debt-links") ? { debtId: link?.debtId ?? null } : {}),
    ...(features.has("family-workspaces") ? { authorUserId: link?.authorUserId ?? null } : {}),
  };
}

function linkIds(entityType: string, payload: Payload | null): string[] {
  if (!payload) return [];
  if (entityType === "transaction") return [payload.id as string];
  if (entityType === "transfer") return [payload.fromTransactionId as string];
  return [];
}

export async function shapeChangesForClient(
  env: Bindings,
  tenantId: string,
  changes: MobileSyncChange[],
  features: MobileSyncFeatures,
): Promise<MobileSyncChange[]> {
  const links = readsLinks(features)
    ? await readTransactionLinks(
        env,
        tenantId,
        changes.flatMap((change) => linkIds(change.entityType, change.payload)),
      )
    : new Map<string, TransactionLinks>();
  return changes.map((change) => {
    if (!change.payload) return change;
    // An occasion budget has no place in a client that predates budget scopes: its month and
    // category would collide with a real plan. It gets a tombstone, which the client ignores.
    if (isOccasionBudget(change.entityType, change.payload, features)) {
      return { ...change, operation: "delete" as const, payload: null };
    }
    return {
      ...change,
      payload: shapePayload(
        change.entityType,
        change.payload,
        features,
        links,
      ) as MobileSyncChange["payload"],
    };
  });
}

function isOccasionBudget(
  entityType: string,
  payload: Payload,
  features: MobileSyncFeatures,
): boolean {
  return entityType === "budget" && !features.has("budget-scopes") && Boolean(payload.occasionId);
}

/** Conflict results carry a server row, which reaches the client like a pulled change. */
export async function shapePushResultsForClient(
  env: Bindings,
  tenantId: string,
  results: MobileSyncPushResult[],
  features: MobileSyncFeatures,
): Promise<MobileSyncPushResult[]> {
  const serverRow = (result: MobileSyncPushResult) =>
    result.status === "conflict" ? result.serverPayload : null;
  const links = readsLinks(features)
    ? await readTransactionLinks(
        env,
        tenantId,
        results.flatMap((result) => linkIds(result.entityType, serverRow(result))),
      )
    : new Map<string, TransactionLinks>();
  return results.map((result) => {
    const payload = serverRow(result);
    if (result.status !== "conflict" || !payload) return result;
    return {
      ...result,
      serverPayload: shapePayload(
        result.entityType,
        payload,
        features,
        links,
      ) as typeof result.serverPayload,
    };
  });
}
