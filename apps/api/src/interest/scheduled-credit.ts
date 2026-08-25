import type { Bindings } from "../types";
import { isInterestCreditDay, manilaDate, interestAmountMinor } from "./credit";

export interface CreditInterestResult {
  checked: number;
  credited: number;
  skipped: number;
}

const INTEREST_CATEGORY_KEY = "interest:income";

/** D1 allows at most 100 bound parameters per query; stay safely below it. */
const BIND_CHUNK_SIZE = 90;

interface InterestDueAccount {
  id: string;
  tenantId: string;
  annualRateBasisPoints: number;
  interestFrequency: "daily" | "monthly" | "yearly";
  interestPayDay: number | null;
  hasPro: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function groupByTenant<T extends { tenantId: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.tenantId);
    if (group) group.push(item);
    else groups.set(item.tenantId, [item]);
  }
  return groups;
}

/**
 * Credit automatic interest for every due savings account as of today (Asia/Manila).
 * Idempotent: a deterministic import_fingerprint per (tenant, account, date, frequency)
 * makes repeated or racing runs skip already-credited periods (unique transactions_tenant_fingerprint_unique).
 *
 * Entitlement, category, and balance lookups are batched (chunked under the D1 bind
 * limit) so the run costs a fixed handful of queries regardless of account count.
 */
export async function creditDueInterest(
  env: Bindings,
  today: string = manilaDate(),
): Promise<CreditInterestResult> {
  const result: CreditInterestResult = { checked: 0, credited: 0, skipped: 0 };

  const rows = await env.DB.prepare(
    `SELECT id,
            tenant_id AS tenantId,
            annual_rate_basis_points AS annualRateBasisPoints,
            interest_frequency AS interestFrequency,
            interest_pay_day AS interestPayDay,
            EXISTS (
              SELECT 1 FROM effective_pro_entitlements e WHERE e.tenant_id = accounts.tenant_id
            ) AS hasPro
     FROM accounts
     WHERE type = 'savings' AND interest_enabled = 1 AND archived = 0`,
  ).all<InterestDueAccount>();

  // Interest is a Pro feature: free tenants stop accruing after downgrade.
  const proAccounts: InterestDueAccount[] = [];
  for (const account of rows.results ?? []) {
    result.checked += 1;
    if (!account.hasPro) {
      result.skipped += 1;
      continue;
    }
    if (!isInterestCreditDay(account.interestFrequency, account.interestPayDay, today)) {
      continue;
    }
    proAccounts.push(account);
  }
  if (proAccounts.length === 0) return result;

  const categoryByTenant = new Map<string, string>();
  for (const tenantIds of chunk([...new Set(proAccounts.map((a) => a.tenantId))], BIND_CHUNK_SIZE)) {
    const placeholders = tenantIds.map(() => "?").join(", ");
    const categoryRows = await env.DB.prepare(
      `SELECT tenant_id AS tenantId, id
       FROM categories
       WHERE system_key = ? AND archived = 0 AND tenant_id IN (${placeholders})`,
    )
      .bind(INTEREST_CATEGORY_KEY, ...tenantIds)
      .all<{ tenantId: string; id: string }>();
    for (const row of categoryRows.results) categoryByTenant.set(row.tenantId, row.id);
  }

  const categorized: Array<{ account: InterestDueAccount; categoryId: string }> = [];
  for (const account of proAccounts) {
    const categoryId = categoryByTenant.get(account.tenantId);
    if (!categoryId) {
      console.log(
        JSON.stringify({ message: "Interest category missing", tenantId: account.tenantId }),
      );
      result.skipped += 1;
      continue;
    }
    categorized.push({ account, categoryId });
  }
  if (categorized.length === 0) return result;

  // Balance lookups stay tenant-scoped like the original per-account SUM.
  // Interest-enabled savings are a Pro feature, so tenants per run are few;
  // each tenant's accounts still chunk under the D1 bind limit.
  const balanceByAccountId = new Map<string, number>();
  for (const [tenantId, accounts] of groupByTenant(categorized.map((c) => c.account))) {
    for (const accountIds of chunk(accounts.map((a) => a.id), BIND_CHUNK_SIZE)) {
      const placeholders = accountIds.map(() => "?").join(", ");
      const balanceRows = await env.DB.prepare(
        `SELECT account_id AS accountId,
                COALESCE(SUM(CASE
                  WHEN (kind != 'transfer' OR transfer_group_id IS NOT NULL) AND currency = 'PHP'
                  THEN amount_minor ELSE 0 END), 0) AS balance
         FROM transactions
         WHERE tenant_id = ? AND date <= ? AND account_id IN (${placeholders})
         GROUP BY account_id`,
      )
        .bind(tenantId, today, ...accountIds)
        .all<{ accountId: string; balance: number }>();
      for (const row of balanceRows.results) {
        balanceByAccountId.set(row.accountId, Number(row.balance));
      }
    }
  }

  const creditable: Array<{
    account: InterestDueAccount;
    categoryId: string;
    amount: number;
    fingerprint: string;
  }> = [];
  for (const { account, categoryId } of categorized) {
    const balance = balanceByAccountId.get(account.id) ?? 0;
    const amount = interestAmountMinor(balance, account.annualRateBasisPoints, account.interestFrequency);
    if (amount <= 0) {
      result.skipped += 1;
      continue;
    }
    creditable.push({
      account,
      categoryId,
      amount,
      fingerprint: `interest:${account.tenantId}:${account.id}:${today}:${account.interestFrequency}`,
    });
  }
  if (creditable.length === 0) return result;

  const existingFingerprints = new Set<string>();
  for (const fingerprints of chunk(
    creditable.map((c) => c.fingerprint),
    BIND_CHUNK_SIZE,
  )) {
    const placeholders = fingerprints.map(() => "?").join(", ");
    const fingerprintRows = await env.DB.prepare(
      `SELECT import_fingerprint FROM transactions WHERE import_fingerprint IN (${placeholders})`,
    )
      .bind(...fingerprints)
      .all<{ import_fingerprint: string }>();
    for (const row of fingerprintRows.results) existingFingerprints.add(row.import_fingerprint);
  }

  const pending = creditable.filter((entry) => !existingFingerprints.has(entry.fingerprint));
  if (pending.length === 0) return result;

  const insertStatement = ({ account, categoryId, amount, fingerprint }: (typeof pending)[number]) =>
    env.DB.prepare(
      `INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, import_fingerprint, source_kind)
       VALUES (?, ?, ?, ?, ?, 'Interest', ?, 'PHP', 'income', ?, 'manual')`,
    ).bind(crypto.randomUUID(), account.tenantId, account.id, categoryId, today, amount, fingerprint);

  try {
    await env.DB.batch(pending.map(insertStatement));
    result.credited = pending.length;
  } catch {
    // A racing run can claim a fingerprint between the check and the insert.
    // Fall back to per-account batches so one tenant's conflict does not roll
    // back every other tenant's credit for the period.
    let credited = 0;
    for (const entry of pending) {
      try {
        await env.DB.batch([insertStatement(entry)]);
        credited += 1;
      } catch {
        console.log(
          JSON.stringify({
            message: "Interest credit already exists",
            tenantId: entry.account.tenantId,
            accountId: entry.account.id,
          }),
        );
      }
    }
    result.credited = credited;
  }

  return result;
}
