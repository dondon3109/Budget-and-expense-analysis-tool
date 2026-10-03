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

// D1 caps bound parameters per statement well above this; a pull page holds at most 200 rows.
const DEBT_LOOKUP_CHUNK = 90;

type Payload = Record<string, unknown>;

/** Reads the stored debt link of each transaction row; rows without one map to null. */
async function readDebtLinks(
  env: Bindings,
  tenantId: string,
  transactionIds: string[],
): Promise<Map<string, string | null>> {
  const links = new Map<string, string | null>();
  const unique = [...new Set(transactionIds)];
  for (let start = 0; start < unique.length; start += DEBT_LOOKUP_CHUNK) {
    const chunk = unique.slice(start, start + DEBT_LOOKUP_CHUNK);
    const rows = await env.DB.prepare(
      `SELECT id, debt_id AS debtId FROM transactions
       WHERE tenant_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`,
    )
      .bind(tenantId, ...chunk)
      .all<{ id: string; debtId: string | null }>();
    for (const row of rows.results) links.set(row.id, row.debtId);
  }
  return links;
}

/**
 * Shapes one outgoing row for the client. The change log stores payloads without debt links, so
 * a "debt-links" client gets the current link read from the row; a transfer's sits on its
 * sending leg. Clients without "account-types-v2" see newer account types as "other".
 */
function shapePayload(
  entityType: string,
  payload: Payload,
  features: MobileSyncFeatures,
  debtLinks: Map<string, string | null>,
): Payload {
  if (entityType === "account" && !features.has("account-types-v2")) {
    const type = payload.type as AccountType;
    return PROTOCOL_V1_ACCOUNT_TYPES.includes(type) ? payload : { ...payload, type: "other" };
  }
  if (!features.has("debt-links")) return payload;
  if (entityType === "transaction") {
    return { ...payload, debtId: debtLinks.get(payload.id as string) ?? null };
  }
  if (entityType === "transfer") {
    return { ...payload, debtId: debtLinks.get(payload.fromTransactionId as string) ?? null };
  }
  return payload;
}

function debtLinkIds(entityType: string, payload: Payload | null): string[] {
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
  const debtLinks = features.has("debt-links")
    ? await readDebtLinks(
        env,
        tenantId,
        changes.flatMap((change) => debtLinkIds(change.entityType, change.payload)),
      )
    : new Map<string, string | null>();
  return changes.map((change) =>
    change.payload
      ? {
          ...change,
          payload: shapePayload(
            change.entityType,
            change.payload,
            features,
            debtLinks,
          ) as MobileSyncChange["payload"],
        }
      : change,
  );
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
  const debtLinks = features.has("debt-links")
    ? await readDebtLinks(
        env,
        tenantId,
        results.flatMap((result) => debtLinkIds(result.entityType, serverRow(result))),
      )
    : new Map<string, string | null>();
  return results.map((result) => {
    const payload = serverRow(result);
    if (result.status !== "conflict" || !payload) return result;
    return {
      ...result,
      serverPayload: shapePayload(
        result.entityType,
        payload,
        features,
        debtLinks,
      ) as typeof result.serverPayload,
    };
  });
}
