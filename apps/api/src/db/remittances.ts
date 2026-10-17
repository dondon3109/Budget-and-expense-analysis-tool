import {
  isCurrency,
  type Currency,
  type FamilyRemittance,
  type FamilyRemittanceOverview,
  type FamilyRemittanceReceiveInput,
  type FamilyRemittanceSendInput,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { insertStatement, validateTransactionReferences } from "./transactions";
import { loadWorkspaceCurrency } from "./workspace-settings";

/** Months of history shown under the card, at most. */
const HISTORY_MONTHS = 24;
const RECENT_LIMIT = 10;
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export interface RemittanceRepository {
  /** Records a send, or a send and its arrival together when `input.received` is given. */
  send(
    env: Bindings,
    tenantId: string,
    userId: string,
    input: FamilyRemittanceSendInput,
  ): Promise<FamilyRemittance>;
  receive(
    env: Bindings,
    tenantId: string,
    userId: string,
    remittanceId: string,
    input: FamilyRemittanceReceiveInput,
  ): Promise<FamilyRemittance>;
  /** Cancels a send that never arrived; `senderOnly` limits it to that sender's own sends. */
  cancel(env: Bindings, tenantId: string, remittanceId: string, senderOnly?: string): Promise<void>;
  overview(env: Bindings, tenantId: string, month: string): Promise<FamilyRemittanceOverview>;
}

type RemittanceRow = {
  id: string;
  sentByUserId: string;
  sentAmountMinor: number;
  sentCurrency: string;
  feeMinor: number;
  provider: string | null;
  sentOn: string;
  note: string | null;
  transactionId: string | null;
  receivedByUserId: string | null;
  receivedAmountMinor: number | null;
  receivedCurrency: string | null;
  receivedDate: string | null;
};

// The received half comes from the live transaction: a deleted one reads as missing.
const REMITTANCE_SELECT = `SELECT r.id, r.sent_by_user_id AS sentByUserId,
    r.sent_amount_minor AS sentAmountMinor, r.sent_currency AS sentCurrency,
    r.fee_minor AS feeMinor, r.provider, r.sent_on AS sentOn, r.note,
    r.transaction_id AS transactionId, r.received_by_user_id AS receivedByUserId,
    t.amount_minor AS receivedAmountMinor, t.currency AS receivedCurrency, t.date AS receivedDate
  FROM family_remittances r
  LEFT JOIN transactions t ON t.id = r.transaction_id AND t.tenant_id = r.tenant_id`;

function currencyOf(value: string | null): Currency {
  return value && isCurrency(value) ? value : "PHP";
}

function normalize(row: RemittanceRow): FamilyRemittance {
  return {
    id: row.id,
    sentByUserId: row.sentByUserId,
    sentAmountMinor: row.sentAmountMinor,
    sentCurrency: currencyOf(row.sentCurrency),
    feeMinor: row.feeMinor,
    provider: row.provider,
    sentOn: row.sentOn,
    note: row.note,
    received:
      row.transactionId && row.receivedByUserId && row.receivedAmountMinor !== null
        ? {
            transactionId: row.transactionId,
            amountMinor: row.receivedAmountMinor,
            currency: currencyOf(row.receivedCurrency),
            date: row.receivedDate!,
            byUserId: row.receivedByUserId,
          }
        : null,
  };
}

async function find(env: Bindings, tenantId: string, id: string): Promise<FamilyRemittance> {
  const row = await env.DB.prepare(`${REMITTANCE_SELECT} WHERE r.tenant_id = ? AND r.id = ?`)
    .bind(tenantId, id)
    .first<RemittanceRow>();
  if (!row) throw new HttpError(404, "remittance_not_found", "That remittance was not found.");
  return normalize(row);
}

/** The income transaction a remittance becomes once it arrives. */
async function arrivalStatement(
  env: Bindings,
  tenantId: string,
  userId: string,
  transactionId: string,
  provider: string | null | undefined,
  received: FamilyRemittanceReceiveInput,
) {
  const currency = await loadWorkspaceCurrency(env, tenantId);
  const input = {
    kind: "income" as const,
    accountId: received.accountId,
    categoryId: received.categoryId,
    date: received.date,
    description: provider ? `Remittance via ${provider}` : "Remittance",
    amountMinor: received.amountMinor,
    currency,
  };
  await validateTransactionReferences(env, tenantId, input);
  return insertStatement(env, { id: transactionId, tenantId, authorUserId: userId, ...input });
}

function monthEnd(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

/** `month` and the months before it, newest first, stopping at `first`. */
function monthsBack(month: string, first: string, limit: number): string[] {
  const months: string[] = [];
  const cursor = new Date(`${month}T00:00:00Z`);
  for (let index = 0; index < limit; index += 1) {
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    const value = cursor.toISOString().slice(0, 10);
    if (value < first) break;
    months.push(value);
  }
  return months;
}

/** "Left": the family's own open account balances in its currency, never shared balances. */
export async function familyLeftMinor(
  env: Bindings,
  tenantId: string,
  currency: Currency,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(t.amount_minor), 0) AS total
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.tenant_id = t.tenant_id
     WHERE t.tenant_id = ? AND t.currency = ? AND a.archived = 0
       AND (t.kind != 'transfer' OR t.transfer_group_id IS NOT NULL)`,
  )
    .bind(tenantId, currency)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export const remittanceRepository: RemittanceRepository = {
  async send(env, tenantId, userId, input) {
    const id = crypto.randomUUID();
    const transactionId = input.received ? crypto.randomUUID() : null;
    const arrival =
      input.received && transactionId
        ? await arrivalStatement(
            env,
            tenantId,
            userId,
            transactionId,
            input.provider,
            input.received,
          )
        : null;
    await env.DB.batch([
      ...(arrival ? [arrival] : []),
      env.DB.prepare(
        `INSERT INTO family_remittances (id, tenant_id, sent_by_user_id, sent_amount_minor,
           sent_currency, fee_minor, provider, sent_on, note, transaction_id,
           received_by_user_id, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE ${NOW} END)`,
      ).bind(
        id,
        tenantId,
        userId,
        input.sentAmountMinor,
        input.sentCurrency,
        input.feeMinor ?? 0,
        input.provider || null,
        input.sentOn,
        input.note || null,
        transactionId,
        transactionId ? userId : null,
        transactionId,
      ),
    ]);
    return find(env, tenantId, id);
  },

  async receive(env, tenantId, userId, remittanceId, input) {
    const existing = await env.DB.prepare(
      "SELECT provider, received_at AS receivedAt FROM family_remittances WHERE tenant_id = ? AND id = ?",
    )
      .bind(tenantId, remittanceId)
      .first<{ provider: string | null; receivedAt: string | null }>();
    if (!existing)
      throw new HttpError(404, "remittance_not_found", "That remittance was not found.");
    const alreadyReceived = new HttpError(
      409,
      "remittance_already_received",
      "Someone already confirmed this remittance.",
    );
    if (existing.receivedAt) throw alreadyReceived;

    const transactionId = crypto.randomUUID();
    const arrival = await arrivalStatement(
      env,
      tenantId,
      userId,
      transactionId,
      existing.provider,
      input,
    );
    // Two people confirming at once: the claim fails for the second, which then inserts nothing.
    const claimed = await env.DB.prepare(
      `UPDATE family_remittances
       SET transaction_id = ?, received_by_user_id = ?, received_at = ${NOW}
       WHERE tenant_id = ? AND id = ? AND received_at IS NULL`,
    )
      .bind(transactionId, userId, tenantId, remittanceId)
      .run();
    if ((claimed.meta.changes ?? 0) === 0) throw alreadyReceived;
    try {
      await arrival.run();
    } catch (error) {
      await env.DB.prepare(
        `UPDATE family_remittances
         SET transaction_id = NULL, received_by_user_id = NULL, received_at = NULL
         WHERE tenant_id = ? AND id = ? AND transaction_id = ?`,
      )
        .bind(tenantId, remittanceId, transactionId)
        .run();
      throw error;
    }
    return find(env, tenantId, remittanceId);
  },

  async cancel(env, tenantId, remittanceId, senderOnly) {
    const result = await env.DB.prepare(
      `DELETE FROM family_remittances
       WHERE tenant_id = ? AND id = ? AND received_at IS NULL
         AND (? IS NULL OR sent_by_user_id = ?)`,
    )
      .bind(tenantId, remittanceId, senderOnly ?? null, senderOnly ?? null)
      .run();
    if ((result.meta.changes ?? 0) === 0) {
      throw new HttpError(
        404,
        "remittance_not_cancellable",
        "Only a send that has not arrived can be cancelled, by its sender or the owner.",
      );
    }
  },

  async overview(env, tenantId, month) {
    const currency = await loadWorkspaceCurrency(env, tenantId);
    const first = await env.DB.prepare(
      "SELECT MIN(sent_on) AS firstSent, COUNT(*) AS total FROM family_remittances WHERE tenant_id = ?",
    )
      .bind(tenantId)
      .first<{ firstSent: string | null; total: number }>();
    const firstMonth = first?.firstSent ? `${first.firstSent.slice(0, 7)}-01` : month;
    const months = monthsBack(month, firstMonth, HISTORY_MONTHS);
    const from = months.at(-1) ?? month;
    const to = monthEnd(month);

    const [sent, spent, left, pending, recent] = await Promise.all([
      env.DB.prepare(
        `SELECT substr(t.date, 1, 7) || '-01' AS month, SUM(t.amount_minor) AS total
         FROM family_remittances r
         JOIN transactions t ON t.id = r.transaction_id AND t.tenant_id = r.tenant_id
         WHERE r.tenant_id = ? AND t.currency = ? AND t.date >= ? AND t.date < ?
         GROUP BY month`,
      )
        .bind(tenantId, currency, from, to)
        .all<{ month: string; total: number }>(),
      env.DB.prepare(
        `SELECT substr(date, 1, 7) || '-01' AS month, -SUM(amount_minor) AS total
         FROM transactions
         WHERE tenant_id = ? AND kind = 'expense' AND currency = ? AND date >= ? AND date < ?
         GROUP BY month`,
      )
        .bind(tenantId, currency, from, to)
        .all<{ month: string; total: number }>(),
      familyLeftMinor(env, tenantId, currency),
      env.DB.prepare(
        `${REMITTANCE_SELECT} WHERE r.tenant_id = ? AND r.received_at IS NULL
         ORDER BY r.sent_on DESC, r.created_at DESC`,
      )
        .bind(tenantId)
        .all<RemittanceRow>(),
      env.DB.prepare(
        `${REMITTANCE_SELECT} WHERE r.tenant_id = ? AND t.id IS NOT NULL
         ORDER BY t.date DESC, r.received_at DESC LIMIT ?`,
      )
        .bind(tenantId, RECENT_LIMIT)
        .all<RemittanceRow>(),
    ]);
    const totals = (rows: { month: string; total: number }[]) =>
      new Map(rows.map((row) => [row.month, Number(row.total)]));
    const sentByMonth = totals(sent.results);
    const spentByMonth = totals(spent.results);
    const row = (value: string) => ({
      month: value,
      sentMinor: sentByMonth.get(value) ?? 0,
      spentMinor: spentByMonth.get(value) ?? 0,
    });
    return {
      currency,
      month: row(month),
      leftMinor: left,
      pending: pending.results.map(normalize),
      recent: recent.results.map(normalize),
      history: months.map(row),
      hasRemittances: (first?.total ?? 0) > 0,
    };
  },
};
