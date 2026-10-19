// Local read for a family's Sent · Spent · Left card. It mirrors the Worker's remittance overview
// (`apps/api/src/db/remittances.ts`) so the card reads the same offline.

import { currencies, type Currency, type FamilyRemittance } from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import { nextMonthStart } from "./budget-queries";

const RECENT_LIMIT = 10;
const HISTORY_MONTHS = 24;

export type LocalRemittance = FamilyRemittance & {
  syncState: "synced" | "pending" | "failed" | "conflicted";
};

export interface LocalRemittanceMonth {
  month: string;
  sentMinor: number;
  spentMinor: number;
}

export interface LocalRemittanceOverview {
  currency: Currency;
  month: LocalRemittanceMonth;
  leftMinor: number;
  pending: LocalRemittance[];
  recent: LocalRemittance[];
  /** Earlier months, newest first, back to the first month with a remittance. */
  history: LocalRemittanceMonth[];
  hasRemittances: boolean;
}

const remittanceRowSchema = z.object({
  id: z.string(),
  sent_by_user_id: z.string(),
  sent_amount_minor: z.number().int().safe(),
  sent_currency: z.enum(currencies),
  fee_minor: z.number().int().safe(),
  provider: z.string().nullable(),
  sent_on: z.string(),
  note: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
  transaction_id: z.string().nullable(),
  received_by_user_id: z.string().nullable(),
  received_amount_minor: z.number().int().safe().nullable(),
  received_currency: z.enum(currencies).nullable(),
  received_date: z.string().nullable(),
});

const monthTotalSchema = z.object({ month: z.string(), total: z.number().int().safe() });

// A received remittance whose income entry was deleted is in neither list, as on the Worker.
const REMITTANCE_SELECT = `
  SELECT r.id, r.sent_by_user_id, r.sent_amount_minor, r.sent_currency, r.fee_minor, r.provider,
    r.sent_on, r.note, r.sync_state, r.transaction_id, r.received_by_user_id,
    t.amount_minor AS received_amount_minor, t.currency AS received_currency,
    t.date AS received_date
  FROM remittances r
  LEFT JOIN transactions t ON t.id = r.transaction_id AND t.deleted_at IS NULL
  WHERE r.deleted_at IS NULL`;

function toRemittance(value: unknown): LocalRemittance {
  const row = remittanceRowSchema.parse(value);
  const received =
    row.transaction_id &&
    row.received_amount_minor !== null &&
    row.received_currency &&
    row.received_date
      ? {
          transactionId: row.transaction_id,
          amountMinor: row.received_amount_minor,
          currency: row.received_currency,
          date: row.received_date,
          byUserId: row.received_by_user_id ?? row.sent_by_user_id,
        }
      : null;
  return {
    id: row.id,
    sentByUserId: row.sent_by_user_id,
    sentAmountMinor: row.sent_amount_minor,
    sentCurrency: row.sent_currency,
    feeMinor: row.fee_minor,
    provider: row.provider,
    sentOn: row.sent_on,
    note: row.note,
    received,
    syncState: row.sync_state,
  };
}

/** `month` and up to HISTORY_MONTHS before it, newest first, stopping before `first`. */
function monthsBack(month: string, first: string): string[] {
  const months: string[] = [];
  const cursor = new Date(`${month}T00:00:00Z`);
  for (let index = 0; index < HISTORY_MONTHS; index += 1) {
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    const value = cursor.toISOString().slice(0, 10);
    if (value < first) break;
    months.push(value);
  }
  return months;
}

/**
 * Reads the card for `month` (a `YYYY-MM-01`) in the family `currency`: received remittances and
 * expenses dated in each month, the family's open account balances, sends still on the way, and
 * the latest arrivals.
 */
export async function readRemittanceOverview(
  database: SQLiteDatabase,
  month: string,
  currency: Currency,
): Promise<LocalRemittanceOverview> {
  const first = z.object({ first_sent: z.string().nullable(), total: z.number().int() }).parse(
    await database.getFirstAsync(
      `SELECT MIN(sent_on) AS first_sent, COUNT(*) AS total
         FROM remittances WHERE deleted_at IS NULL`,
    ),
  );
  const firstMonth = first.first_sent ? `${first.first_sent.slice(0, 7)}-01` : month;
  const history = monthsBack(month, firstMonth);
  const from = history.at(-1) ?? month;
  const to = nextMonthStart(month);

  const totals = (rows: unknown[]) =>
    new Map(
      rows.map((value) => {
        const row = monthTotalSchema.parse(value);
        return [row.month, row.total];
      }),
    );
  const sent = totals(
    await database.getAllAsync(
      `SELECT substr(t.date, 1, 7) || '-01' AS month, SUM(t.amount_minor) AS total
       FROM remittances r JOIN transactions t ON t.id = r.transaction_id
       WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL
         AND t.currency = ? AND t.date >= ? AND t.date < ?
       GROUP BY month`,
      currency,
      from,
      to,
    ),
  );
  const spent = totals(
    await database.getAllAsync(
      `SELECT substr(date, 1, 7) || '-01' AS month, -SUM(amount_minor) AS total
       FROM transactions
       WHERE deleted_at IS NULL AND kind = 'expense' AND currency = ? AND date >= ? AND date < ?
       GROUP BY month`,
      currency,
      from,
      to,
    ),
  );
  // Shared balances are online only and never stored here, so every account is the family's own.
  const left = z.object({ total: z.number().int().safe() }).parse(
    await database.getFirstAsync(
      `SELECT COALESCE(SUM(t.amount_minor), 0) AS total
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.deleted_at IS NULL AND a.deleted_at IS NULL AND a.archived = 0 AND t.currency = ?
         AND (t.kind != 'transfer' OR t.transfer_group_id IS NOT NULL)`,
      currency,
    ),
  );
  const pending = await database.getAllAsync(
    `${REMITTANCE_SELECT} AND r.transaction_id IS NULL ORDER BY r.sent_on DESC, r.id`,
  );
  const recent = await database.getAllAsync(
    `${REMITTANCE_SELECT} AND t.id IS NOT NULL ORDER BY t.date DESC, r.sent_on DESC LIMIT ?`,
    RECENT_LIMIT,
  );

  const row = (value: string): LocalRemittanceMonth => ({
    month: value,
    sentMinor: sent.get(value) ?? 0,
    spentMinor: spent.get(value) ?? 0,
  });
  return {
    currency,
    month: row(month),
    leftMinor: left.total,
    pending: pending.map(toRemittance),
    recent: recent.map(toRemittance),
    history: history.map(row),
    hasRemittances: first.total > 0,
  };
}

/** One remittance on this phone, or null once it is gone (cancelled, or never existed). */
export async function readRemittance(
  database: SQLiteDatabase,
  id: string,
): Promise<LocalRemittance | null> {
  const row = await database.getFirstAsync(`${REMITTANCE_SELECT} AND r.id = ?`, id);
  return row ? toRemittance(row) : null;
}
