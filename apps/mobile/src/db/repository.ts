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

export class LocalWorkspaceRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async getStats(): Promise<LocalWorkspaceStats> {
    const decoded = workspaceStatsRowSchema.parse(
      await this.database.getFirstAsync(`
        SELECT
          (SELECT count(*) FROM accounts WHERE deleted_at IS NULL) AS account_count,
          (SELECT count(*) FROM categories WHERE deleted_at IS NULL) AS category_count,
          (SELECT count(*) FROM transactions WHERE deleted_at IS NULL) AS transaction_count,
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
}
