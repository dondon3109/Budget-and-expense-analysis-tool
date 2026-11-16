import type { SQLiteDatabase } from "expo-sqlite";

/**
 * SQL for what payments still waiting to sync will take off a debt. The server owns debt
 * balances and pays a debt down only when a payment reaches it, so the device shows the stored
 * balance minus this. Only payments queued after the debt's own pending edit count: the outbox
 * pushes in order, so the server applies an earlier payment before that edit sets the balance.
 * An edit of a synced payment is left out, since the device does not keep what it replaced.
 */
export function pendingDebtPaymentsSql(debtId: string): string {
  return `(SELECT COALESCE(SUM(ABS(t.amount_minor) - COALESCE(t.transfer_fee_minor, 0)), 0)
    FROM transactions t
    JOIN sync_outbox o ON o.operation_type = 'create'
      AND o.state IN ('pending', 'sending', 'retryable')
      AND ((o.entity_type = 'transaction' AND o.entity_id = t.id)
        OR (o.entity_type = 'transfer' AND o.entity_id = t.transfer_group_id))
    WHERE t.debt_id = ${debtId} AND t.deleted_at IS NULL
      AND o.created_sequence > COALESCE((SELECT MAX(d.created_sequence) FROM sync_outbox d
        WHERE d.entity_type = 'debt' AND d.entity_id = ${debtId}), 0))`;
}

export async function pendingDebtPaymentMinor(
  database: SQLiteDatabase,
  debtId: string,
): Promise<number> {
  const row = await database.getFirstAsync<{ total: number }>(
    `SELECT ${pendingDebtPaymentsSql("?1")} AS total`,
    debtId,
  );
  return row?.total ?? 0;
}
