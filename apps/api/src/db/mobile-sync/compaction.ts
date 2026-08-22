import type { Bindings } from "../../types";
import { mobileSyncServerTimestamp } from "./protocol";

interface CompactionTenantRow {
  tenantId: string;
  safeSequence: number;
}

export interface MobileSyncCompactionResult {
  tenants: number;
  deletedChanges: number;
  expiredClients: number;
}

/**
 * Removes only changes every non-expired installation has acknowledged and that
 * are older than the supported 90-day offline window. Latest live snapshots are
 * retained; acknowledged deletion tombstones may be compacted because a future
 * full snapshot represents their absence.
 */
export async function compactMobileSyncChanges(
  env: Bindings,
  now = mobileSyncServerTimestamp(),
  batchLimit = 1_000,
): Promise<MobileSyncCompactionResult> {
  if (!Number.isSafeInteger(batchLimit) || batchLimit < 1 || batchLimit > 5_000) {
    throw new Error("Choose a mobile sync compaction batch from 1 to 5,000.");
  }
  const cutoff = new Date(`${now.replace(" ", "T")}Z`);
  if (Number.isNaN(cutoff.getTime())) throw new Error("Choose a valid compaction timestamp.");
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffTimestamp = cutoff
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  await env.DB.prepare(
    `UPDATE mobile_sync_clients SET snapshot_sequence = NULL, snapshot_expires_at = NULL
     WHERE snapshot_expires_at IS NOT NULL AND snapshot_expires_at < ?`,
  )
    .bind(now)
    .run();
  const expired = await env.DB.prepare(
    `DELETE FROM mobile_sync_clients
     WHERE expires_at < ? AND snapshot_sequence IS NULL`,
  )
    .bind(now)
    .run();
  const candidates = await env.DB.prepare(
    `SELECT state.tenant_id AS tenantId,
            MIN(clients.acknowledged_sequence) AS safeSequence
     FROM mobile_sync_state state
     JOIN mobile_sync_clients clients ON clients.tenant_id = state.tenant_id
     WHERE clients.expires_at >= ?
       AND NOT EXISTS (
         SELECT 1 FROM mobile_sync_clients snapshot
         WHERE snapshot.tenant_id = state.tenant_id
           AND snapshot.snapshot_expires_at >= ?
       )
     GROUP BY state.tenant_id
     HAVING MIN(clients.acknowledged_sequence) > state.retention_floor_sequence
     LIMIT 100`,
  )
    .bind(now, now)
    .all<CompactionTenantRow>();

  let deletedChanges = 0;
  for (const candidate of candidates.results) {
    const safeSequence = Number(candidate.safeSequence);
    if (!Number.isSafeInteger(safeSequence) || safeSequence < 1) continue;
    const results = await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM mobile_sync_changes
         WHERE tenant_id = ? AND sequence IN (
           SELECT old.sequence
           FROM mobile_sync_changes old
           WHERE old.tenant_id = ? AND old.sequence <= ? AND old.server_updated_at < ?
             AND (
               old.operation = 'delete'
               OR EXISTS (
                 SELECT 1 FROM mobile_sync_changes newer
                 WHERE newer.tenant_id = old.tenant_id
                   AND newer.entity_type = old.entity_type
                   AND newer.entity_id = old.entity_id
                   AND newer.sequence > old.sequence
               )
             )
           ORDER BY old.sequence LIMIT ?
         )`,
      ).bind(candidate.tenantId, candidate.tenantId, safeSequence, cutoffTimestamp, batchLimit),
      env.DB.prepare(
        `UPDATE mobile_sync_state
         SET retention_floor_sequence = MAX(retention_floor_sequence, ?), updated_at = ?
         WHERE tenant_id = ?`,
      ).bind(safeSequence, now, candidate.tenantId),
    ]);
    deletedChanges += Number(results[0]?.meta.changes ?? 0);
  }
  return {
    tenants: candidates.results.length,
    deletedChanges,
    expiredClients: Number(expired.meta.changes ?? 0),
  };
}
