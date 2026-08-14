import type { MobileSyncChange } from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";

export function databaseNameForGeneration(alias: string, generation: number): string {
  const prefix = alias.slice(0, 32);
  return generation <= 1 ? `zoption-${prefix}.db` : `zoption-${prefix}-g${generation}.db`;
}

export interface SnapshotPage {
  snapshotCursor: string;
  changes: MobileSyncChange[];
  nextOffset: number;
  hasMore: boolean;
  resumeCursor: string;
}

export type SnapshotPageFetcher = (
  snapshotCursor: string | null,
  offset: number,
) => Promise<SnapshotPage>;

export interface CollectedSnapshot {
  changes: MobileSyncChange[];
  resumeCursor: string;
}

export class SnapshotRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotRecoveryError";
  }
}

export async function collectSnapshotPages(
  fetchPage: SnapshotPageFetcher,
  maxPages = 500,
): Promise<CollectedSnapshot> {
  let snapshotCursor: string | null = null;
  let offset = 0;
  let resumeCursor: string | null = null;
  const changes: MobileSyncChange[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchPage(snapshotCursor, offset);
    if (snapshotCursor !== null && response.snapshotCursor !== snapshotCursor) {
      throw new SnapshotRecoveryError("The full snapshot session changed during recovery.");
    }
    if (response.nextOffset !== offset + response.changes.length) {
      throw new SnapshotRecoveryError("The full snapshot offset did not advance consistently.");
    }
    if (resumeCursor !== null && response.resumeCursor !== resumeCursor) {
      throw new SnapshotRecoveryError("The full snapshot resume cursor changed during recovery.");
    }
    snapshotCursor = response.snapshotCursor;
    offset = response.nextOffset;
    resumeCursor = response.resumeCursor;
    changes.push(...response.changes);
    if (!response.hasMore) {
      return { changes, resumeCursor: resumeCursor ?? response.resumeCursor };
    }
  }
  throw new SnapshotRecoveryError("The full snapshot exceeded the safe recovery page limit.");
}

export interface SnapshotVerification {
  accountCount: number;
  categoryCount: number;
  transactionCount: number;
}

export async function verifySnapshotGeneration(
  database: SQLiteDatabase,
  subject: string,
  clientId: string,
  resumeCursor: string,
): Promise<SnapshotVerification> {
  const foreignKeyViolations = await database.getAllAsync<{ id: number }>(
    "PRAGMA foreign_key_check",
  );
  if (foreignKeyViolations.length > 0) {
    throw new SnapshotRecoveryError("The recovered local data failed referential verification.");
  }

  const brokenTransfers = await database.getAllAsync<{ transfer_group_id: string }>(
    `SELECT transfer_group_id
     FROM transactions
     WHERE transfer_group_id IS NOT NULL
     GROUP BY transfer_group_id
     HAVING COUNT(*) != 2`,
  );
  if (brokenTransfers.length > 0) {
    throw new SnapshotRecoveryError("The recovered local data contains an incomplete transfer.");
  }

  const subjectRow = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM workspace_metadata WHERE key = 'supabase_subject'",
  );
  if (subjectRow?.value !== subject) {
    throw new SnapshotRecoveryError("The recovered local data belongs to a different identity.");
  }

  const clientRow = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM workspace_metadata WHERE key = 'mobile_client_id'",
  );
  if (clientRow?.value !== clientId) {
    throw new SnapshotRecoveryError("The recovered local data lost its installation identity.");
  }

  const cursorRow = await database.getFirstAsync<{ server_cursor: string | null }>(
    "SELECT server_cursor FROM sync_metadata WHERE singleton = 1",
  );
  if (cursorRow?.server_cursor !== resumeCursor) {
    throw new SnapshotRecoveryError("The recovered local cursor did not match the snapshot.");
  }

  const outboxRow = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_outbox",
  );
  const conflictRow = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_conflicts",
  );
  if ((outboxRow?.count ?? 0) !== 0 || (conflictRow?.count ?? 0) !== 0) {
    throw new SnapshotRecoveryError(
      "The recovered local data unexpectedly retained unsynchronized work.",
    );
  }

  const counts = await database.getFirstAsync<{
    account_count: number;
    category_count: number;
    transaction_count: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM accounts) AS account_count,
       (SELECT COUNT(*) FROM categories) AS category_count,
       (SELECT COUNT(*) FROM transactions) AS transaction_count`,
  );

  return {
    accountCount: counts?.account_count ?? 0,
    categoryCount: counts?.category_count ?? 0,
    transactionCount: counts?.transaction_count ?? 0,
  };
}
