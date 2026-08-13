import type { TransactionListItem } from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

const workspaceStatsRowSchema = z.object({
  account_count: z.number().int().nonnegative(),
  category_count: z.number().int().nonnegative(),
  transaction_count: z.number().int().nonnegative(),
  unsynced_operation_count: z.number().int().nonnegative(),
  unresolved_conflict_count: z.number().int().nonnegative(),
});

export interface LocalWorkspaceStats {
  accountCount: number;
  categoryCount: number;
  transactionCount: number;
  unsyncedOperationCount: number;
  unresolvedConflictCount: number;
}

const localTransactionRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  description: z.string(),
  amount_minor: z.number().int().safe(),
  currency: z.enum(["PHP", "USD"]),
  kind: z.enum(["income", "expense", "transfer"]),
  category_id: z.string(),
  category_name: z.string(),
  category_color: z.string(),
  account_id: z.string().nullable(),
  account_name: z.string().nullable(),
  notes: z.string().nullable(),
  transfer_group_id: z.string().nullable(),
  transfer_fee_minor: z.number().int().safe().nullable(),
  to_account_id: z.string().nullable(),
  to_account_name: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});

export interface LocalTransactionItem {
  transaction: TransactionListItem;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export class LocalWorkspaceRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async getStats(): Promise<LocalWorkspaceStats> {
    const decoded = workspaceStatsRowSchema.parse(
      await this.database.getFirstAsync(`
        SELECT
          (SELECT count(*) FROM accounts WHERE deleted_at IS NULL) AS account_count,
          (SELECT count(*) FROM categories WHERE deleted_at IS NULL) AS category_count,
          (SELECT count(*) FROM transactions
            WHERE deleted_at IS NULL
              AND (kind != 'transfer' OR transfer_group_id IS NULL OR amount_minor < 0))
            AS transaction_count,
          (SELECT count(*) FROM sync_outbox
            WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted'))
            AS unsynced_operation_count,
          (SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL)
            AS unresolved_conflict_count
      `),
    );
    return {
      accountCount: decoded.account_count,
      categoryCount: decoded.category_count,
      transactionCount: decoded.transaction_count,
      unsyncedOperationCount: decoded.unsynced_operation_count,
      unresolvedConflictCount: decoded.unresolved_conflict_count,
    };
  }

  async listTransactions(limit = 100): Promise<LocalTransactionItem[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Choose a transaction page size from 1 to 200.");
    }
    const rows = z.array(localTransactionRowSchema).parse(
      await this.database.getAllAsync(
        `SELECT
          transaction_row.id,
          transaction_row.date,
          transaction_row.description,
          transaction_row.amount_minor,
          transaction_row.currency,
          transaction_row.kind,
          transaction_row.category_id,
          category.name AS category_name,
          category.color AS category_color,
          transaction_row.account_id,
          account.name AS account_name,
          transaction_row.notes,
          transaction_row.transfer_group_id,
          transaction_row.transfer_fee_minor,
          peer.account_id AS to_account_id,
          destination.name AS to_account_name,
          transaction_row.sync_state
        FROM transactions transaction_row
        INNER JOIN categories category
          ON category.id = transaction_row.category_id AND category.deleted_at IS NULL
        LEFT JOIN accounts account
          ON account.id = transaction_row.account_id AND account.deleted_at IS NULL
        LEFT JOIN transactions peer
          ON peer.transfer_group_id = transaction_row.transfer_group_id
          AND peer.id != transaction_row.id
          AND peer.amount_minor > 0
          AND peer.deleted_at IS NULL
        LEFT JOIN accounts destination
          ON destination.id = peer.account_id AND destination.deleted_at IS NULL
        WHERE transaction_row.deleted_at IS NULL
          AND (
            transaction_row.kind != 'transfer'
            OR transaction_row.transfer_group_id IS NULL
            OR transaction_row.amount_minor < 0
          )
        ORDER BY transaction_row.date DESC, transaction_row.id DESC
        LIMIT ?`,
        limit,
      ),
    );
    return rows.map((row) => {
      const linkedTransfer = row.kind === "transfer" && row.transfer_group_id !== null;
      const transaction: TransactionListItem = {
        id: row.id,
        date: row.date,
        description: row.description,
        amountMinor: linkedTransfer ? Math.abs(row.amount_minor) : row.amount_minor,
        currency: row.currency,
        kind: row.kind,
        categoryId: row.category_id,
        categoryName: row.category_name,
        categoryColor: row.category_color,
        accountId: row.account_id,
        accountName: row.account_name ?? "Unassigned",
        notes: row.notes,
        transferGroupId: row.transfer_group_id,
        fromAccountId: linkedTransfer ? row.account_id : null,
        fromAccountName: linkedTransfer ? (row.account_name ?? "Unassigned") : null,
        toAccountId: linkedTransfer ? row.to_account_id : null,
        toAccountName: linkedTransfer ? (row.to_account_name ?? "Unassigned") : null,
        transferFeeMinor: row.transfer_fee_minor,
        legacyTransfer: row.kind === "transfer" && !linkedTransfer,
      };
      return { transaction, syncState: row.sync_state };
    });
  }
}
