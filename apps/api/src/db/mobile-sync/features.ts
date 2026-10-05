import type {
  AccountType,
  Currency,
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

// The currencies protocol version 1 shipped with; older installs reject any other value.
const PROTOCOL_V1_CURRENCIES: readonly Currency[] = ["PHP", "USD"];

// D1 caps bound parameters per statement well above this; a pull page holds at most 200 rows.
const LOOKUP_CHUNK = 90;

type Payload = Record<string, unknown>;

/** Reads the stored debt link of each transaction row; rows without one map to null. */
async function readDebtLinks(
  env: Bindings,
  tenantId: string,
  transactionIds: string[],
): Promise<Map<string, string | null>> {
  const links = new Map<string, string | null>();
  const unique = [...new Set(transactionIds)];
  for (let start = 0; start < unique.length; start += LOOKUP_CHUNK) {
    const chunk = unique.slice(start, start + LOOKUP_CHUNK);
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
 * Category system keys and every currency beyond PHP and USD reached the app in the same release
 * (0.2.45) as "account-types-v2", so a client without it gets rows shaped for protocol version 1.
 */
function isProtocolV1Client(features: MobileSyncFeatures): boolean {
  return !features.has("account-types-v2");
}

/** The accounts a row belongs to; the local store holds a foreign key to each. */
function accountIdsOf(entityType: string, payload: Payload): string[] {
  if (entityType === "account") return [payload.id as string];
  if (entityType === "transaction" || entityType === "subscription") {
    return payload.accountId ? [payload.accountId as string] : [];
  }
  if (entityType === "transfer") {
    return [payload.fromAccountId as string, payload.toAccountId as string];
  }
  return [];
}

/** Reads which of the given accounts use a currency protocol version 1 clients cannot hold. */
async function readForeignCurrencyAccounts(
  env: Bindings,
  tenantId: string,
  accountIds: string[],
): Promise<Set<string>> {
  const foreign = new Set<string>();
  const unique = [...new Set(accountIds)];
  for (let start = 0; start < unique.length; start += LOOKUP_CHUNK) {
    const chunk = unique.slice(start, start + LOOKUP_CHUNK);
    const rows = await env.DB.prepare(
      `SELECT id FROM accounts
       WHERE tenant_id = ? AND currency NOT IN (${PROTOCOL_V1_CURRENCIES.map(() => "?").join(", ")})
         AND id IN (${chunk.map(() => "?").join(", ")})`,
    )
      .bind(tenantId, ...PROTOCOL_V1_CURRENCIES, ...chunk)
      .all<{ id: string }>();
    for (const row of rows.results) foreign.add(row.id);
  }
  return foreign;
}

/**
 * A protocol version 1 client cannot store a row in another currency, nor one pointing at an
 * account it never received, so those rows are left out of its pulls and snapshots. Account
 * currencies never change, so it cannot already hold a row this hides.
 */
function holdsForeignCurrency(
  entityType: string,
  payload: Payload,
  foreignAccounts: Set<string>,
): boolean {
  const currency = payload.currency as Currency | undefined;
  if (currency && !PROTOCOL_V1_CURRENCIES.includes(currency)) return true;
  return accountIdsOf(entityType, payload).some((id) => foreignAccounts.has(id));
}

async function withoutForeignCurrencyRows(
  env: Bindings,
  tenantId: string,
  changes: MobileSyncChange[],
): Promise<MobileSyncChange[]> {
  const foreignAccounts = await readForeignCurrencyAccounts(
    env,
    tenantId,
    changes.flatMap((change) =>
      change.payload ? accountIdsOf(change.entityType, change.payload) : [],
    ),
  );
  return changes.filter(
    (change) =>
      !change.payload || !holdsForeignCurrency(change.entityType, change.payload, foreignAccounts),
  );
}

/**
 * Shapes one outgoing row for the client. The change log stores payloads without debt links, so
 * a "debt-links" client gets the current link read from the row; a transfer's sits on its
 * sending leg. Protocol version 1 clients see newer account types as "other" and categories
 * without their system key.
 */
function shapePayload(
  entityType: string,
  payload: Payload,
  features: MobileSyncFeatures,
  debtLinks: Map<string, string | null>,
): Payload {
  if (entityType === "account" && isProtocolV1Client(features)) {
    const type = payload.type as AccountType;
    return PROTOCOL_V1_ACCOUNT_TYPES.includes(type) ? payload : { ...payload, type: "other" };
  }
  if (entityType === "category" && isProtocolV1Client(features)) {
    const shaped = { ...payload };
    delete shaped.systemKey;
    return shaped;
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
  const visible = isProtocolV1Client(features)
    ? await withoutForeignCurrencyRows(env, tenantId, changes)
    : changes;
  const debtLinks = features.has("debt-links")
    ? await readDebtLinks(
        env,
        tenantId,
        visible.flatMap((change) => debtLinkIds(change.entityType, change.payload)),
      )
    : new Map<string, string | null>();
  return visible.map((change) =>
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
