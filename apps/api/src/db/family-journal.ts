import {
  FAMILY_RESTORE_DAYS,
  type FamilyDeletedEntry,
  type FamilyEntryEvent,
  type FamilyEntryView,
  type TransactionListItem,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { findTransaction } from "./transactions";

/**
 * The append-only history of a family's entries. A change records the entry before and after;
 * a delete also stores the raw rows, which is all a restore needs, so the ledger itself keeps
 * hard deletes and no read path has to skip deleted rows.
 */
export interface FamilyJournal {
  /** Reads what a change or delete needs to record; null when the entry does not exist. */
  capture(env: Bindings, tenantId: string, transactionId: string): Promise<Capture | null>;
  recordUpdate(
    env: Bindings,
    tenantId: string,
    userId: string,
    before: Capture,
    after: TransactionListItem,
  ): Promise<void>;
  /** Records a delete before it happens; the returned function withdraws it if the delete fails. */
  recordDelete(
    env: Bindings,
    tenantId: string,
    userId: string,
    before: Capture,
  ): Promise<() => Promise<void>>;
  history(env: Bindings, tenantId: string, transactionId: string): Promise<FamilyEntryEvent[]>;
  deleted(env: Bindings, tenantId: string): Promise<FamilyDeletedEntry[]>;
  /** `deleterOnly` limits it to entries that person deleted: undoing their own delete. */
  restore(
    env: Bindings,
    tenantId: string,
    userId: string,
    transactionId: string,
    deleterOnly?: string,
  ): Promise<void>;
}

type RawRow = Record<string, unknown>;

export interface Capture {
  /** The id the ledger lists: a transfer's sending leg. */
  transactionId: string;
  view: FamilyEntryView;
  rows: RawRow[];
  transferGroup: RawRow | null;
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const RESTORE_WINDOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${FAMILY_RESTORE_DAYS} days')`;
/** Snapshot keys become column names on restore, so only plain column names pass. */
const COLUMN_NAME = /^[a-z_]+$/u;

function view(item: TransactionListItem): FamilyEntryView {
  return {
    date: item.date,
    description: item.description,
    amountMinor: item.amountMinor,
    currency: item.currency,
    kind: item.kind,
    categoryName: item.categoryName,
    accountName:
      item.kind === "transfer" && item.toAccountName
        ? `${item.accountName} → ${item.toAccountName}`
        : item.accountName,
    notes: item.notes,
  };
}

function parse<T>(value: string | null): T | null {
  return value ? (JSON.parse(value) as T) : null;
}

function insertRow(env: Bindings, table: "transactions" | "transfer_groups", row: RawRow) {
  const columns = Object.keys(row).filter((column) => COLUMN_NAME.test(column));
  return env.DB.prepare(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  ).bind(...columns.map((column) => row[column] ?? null));
}

export const familyJournal: FamilyJournal = {
  async capture(env, tenantId, transactionId) {
    const target = await env.DB.prepare(
      "SELECT transfer_group_id AS groupId FROM transactions WHERE tenant_id = ? AND id = ?",
    )
      .bind(tenantId, transactionId)
      .first<{ groupId: string | null }>();
    if (!target) return null;
    const { results: rows } = await env.DB.prepare(
      `SELECT * FROM transactions WHERE tenant_id = ?
         AND (id = ? OR (? IS NOT NULL AND transfer_group_id = ?))
       ORDER BY amount_minor`,
    )
      .bind(tenantId, transactionId, target.groupId, target.groupId)
      .all<RawRow>();
    const listedId = String((rows[0] as RawRow).id);
    const item = await findTransaction(env, tenantId, target.groupId ? listedId : transactionId);
    if (!item) return null;
    const transferGroup = target.groupId
      ? await env.DB.prepare("SELECT * FROM transfer_groups WHERE tenant_id = ? AND id = ?")
          .bind(tenantId, target.groupId)
          .first<RawRow>()
      : null;
    return { transactionId: item.id, view: view(item), rows, transferGroup };
  },

  async recordUpdate(env, tenantId, userId, before, after) {
    await env.DB.prepare(
      `INSERT INTO family_transaction_events
         (tenant_id, transaction_id, user_id, action, before_json, after_json)
       VALUES (?, ?, ?, 'updated', ?, ?)`,
    )
      .bind(
        tenantId,
        before.transactionId,
        userId,
        JSON.stringify(before.view),
        JSON.stringify(view(after)),
      )
      .run();
  },

  async recordDelete(env, tenantId, userId, before) {
    const inserted = await env.DB.prepare(
      `INSERT INTO family_transaction_events
         (tenant_id, transaction_id, user_id, action, before_json, snapshot_json)
       VALUES (?, ?, ?, 'deleted', ?, ?) RETURNING id`,
    )
      .bind(
        tenantId,
        before.transactionId,
        userId,
        JSON.stringify(before.view),
        JSON.stringify({ rows: before.rows, transferGroup: before.transferGroup }),
      )
      .first<{ id: number }>();
    return async () => {
      await env.DB.prepare("DELETE FROM family_transaction_events WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, inserted!.id)
        .run();
    };
  },

  async history(env, tenantId, transactionId) {
    const { results } = await env.DB.prepare(
      `SELECT action, user_id AS userId, created_at AS at, before_json AS beforeJson,
              after_json AS afterJson
       FROM family_transaction_events
       WHERE tenant_id = ? AND transaction_id = ?
       ORDER BY id DESC`,
    )
      .bind(tenantId, transactionId)
      .all<{
        action: FamilyEntryEvent["action"];
        userId: string;
        at: string;
        beforeJson: string | null;
        afterJson: string | null;
      }>();
    return results.map((row) => ({
      action: row.action,
      userId: row.userId,
      at: row.at,
      before: parse<FamilyEntryView>(row.beforeJson),
      after: parse<FamilyEntryView>(row.afterJson),
    }));
  },

  async deleted(env, tenantId) {
    // The latest delete of each entry that is still gone and still inside the restore window.
    const { results } = await env.DB.prepare(
      `SELECT e.transaction_id AS transactionId, e.user_id AS deletedByUserId,
              e.created_at AS deletedAt, e.before_json AS beforeJson,
              strftime('%Y-%m-%dT%H:%M:%fZ', e.created_at, '+${FAMILY_RESTORE_DAYS} days')
                AS restoreUntil
       FROM family_transaction_events e
       WHERE e.tenant_id = ?1 AND e.action = 'deleted' AND e.created_at > ${RESTORE_WINDOW}
         AND e.id = (SELECT MAX(latest.id) FROM family_transaction_events latest
                     WHERE latest.tenant_id = ?1 AND latest.transaction_id = e.transaction_id)
         AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = e.transaction_id)
       ORDER BY e.id DESC`,
    )
      .bind(tenantId)
      .all<Omit<FamilyDeletedEntry, "entry"> & { beforeJson: string }>();
    return results.map(({ beforeJson, ...row }) => ({
      ...row,
      entry: JSON.parse(beforeJson) as FamilyEntryView,
    }));
  },

  async restore(env, tenantId, userId, transactionId, deleterOnly) {
    const event = await env.DB.prepare(
      `SELECT snapshot_json AS snapshotJson, before_json AS beforeJson
       FROM family_transaction_events
       WHERE tenant_id = ?1 AND transaction_id = ?2 AND action = 'deleted'
         AND created_at > ${RESTORE_WINDOW} AND (?3 IS NULL OR user_id = ?3)
         AND id = (SELECT MAX(id) FROM family_transaction_events
                   WHERE tenant_id = ?1 AND transaction_id = ?2)`,
    )
      .bind(tenantId, transactionId, deleterOnly ?? null)
      .first<{ snapshotJson: string; beforeJson: string }>();
    if (!event) {
      throw new HttpError(
        404,
        "entry_not_restorable",
        `The owner restores entries deleted in the last ${FAMILY_RESTORE_DAYS} days; others restore only what they deleted.`,
      );
    }
    const snapshot = JSON.parse(event.snapshotJson) as {
      rows: RawRow[];
      transferGroup: RawRow | null;
    };
    try {
      await env.DB.batch([
        ...snapshot.rows.map((row) => insertRow(env, "transactions", row)),
        ...(snapshot.transferGroup
          ? [insertRow(env, "transfer_groups", snapshot.transferGroup)]
          : []),
        env.DB.prepare(
          `INSERT INTO family_transaction_events
             (tenant_id, transaction_id, user_id, action, after_json, created_at)
           VALUES (?, ?, ?, 'restored', ?, ${NOW})`,
        ).bind(tenantId, transactionId, userId, event.beforeJson),
      ]);
    } catch (error) {
      // A row that came back another way, or an account or category since removed for good.
      if (error instanceof Error && /constraint/iu.test(error.message)) {
        throw new HttpError(409, "entry_not_restorable", "This entry can no longer be restored.");
      }
      throw error;
    }
  },
};
