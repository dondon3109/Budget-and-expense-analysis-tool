import { hasProEntitlement } from "../db/billing";
import type { Bindings } from "../types";
import { isInterestCreditDay, manilaDate, interestAmountMinor } from "./credit";

export interface CreditInterestResult {
  checked: number;
  credited: number;
  skipped: number;
}

const INTEREST_CATEGORY_KEY = "interest:income";

interface InterestDueAccount {
  id: string;
  tenantId: string;
  annualRateBasisPoints: number;
  interestFrequency: "daily" | "monthly" | "yearly";
  interestPayDay: number | null;
}

/** Balance of an account as of `date` (its running derived balance, mirroring the accounts list SUM). */
async function balanceAsOf(
  env: Bindings,
  tenantId: string,
  accountId: string,
  date: string,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE
       WHEN (kind != 'transfer' OR transfer_group_id IS NOT NULL) AND currency = 'PHP'
       THEN amount_minor ELSE 0 END), 0) AS balance
     FROM transactions WHERE tenant_id = ? AND account_id = ? AND date <= ?`,
  )
    .bind(tenantId, accountId, date)
    .first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

async function findInterestCategory(
  env: Bindings,
  tenantId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT id FROM categories WHERE tenant_id = ? AND system_key = ? AND archived = 0",
  )
    .bind(tenantId, INTEREST_CATEGORY_KEY)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Credit automatic interest for every due savings account as of today (Asia/Manila).
 * Idempotent: a deterministic import_fingerprint per (tenant, account, date, frequency)
 * makes repeated or racing runs skip already-credited periods (unique transactions_tenant_fingerprint_unique).
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
            interest_pay_day AS interestPayDay
     FROM accounts
     WHERE type = 'savings' AND interest_enabled = 1 AND archived = 0`,
  ).all<InterestDueAccount>();

  for (const account of rows.results ?? []) {
    result.checked += 1;

    // Interest is a Pro feature: skip free tenants so downgraded users stop accruing.
    if (!(await hasProEntitlement(env, account.tenantId))) {
      result.skipped += 1;
      continue;
    }

    const frequency = account.interestFrequency;
    const payDay = account.interestPayDay;
    if (frequency === null || !isInterestCreditDay(frequency, payDay, today)) {
      continue;
    }

    const categoryId = await findInterestCategory(env, account.tenantId);
    if (!categoryId) {
      console.log(
        JSON.stringify({ message: "Interest category missing", tenantId: account.tenantId }),
      );
      result.skipped += 1;
      continue;
    }

    const balance = await balanceAsOf(env, account.tenantId, account.id, today);
    const amount = interestAmountMinor(balance, account.annualRateBasisPoints, frequency);
    if (amount <= 0) {
      result.skipped += 1;
      continue;
    }

    const fingerprint = `interest:${account.tenantId}:${account.id}:${today}:${frequency}`;
    const existing = await env.DB.prepare(
      "SELECT 1 FROM transactions WHERE tenant_id = ? AND import_fingerprint = ?",
    )
      .bind(account.tenantId, fingerprint)
      .first();
    if (existing) {
      // Already credited for this period.
      continue;
    }
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, import_fingerprint, source_kind)
         VALUES (?, ?, ?, ?, ?, 'Interest', ?, 'PHP', 'income', ?, 'manual')`,
      ).bind(id, account.tenantId, account.id, categoryId, today, amount, fingerprint),
    ]);
    result.credited += 1;
  }

  return result;
}
