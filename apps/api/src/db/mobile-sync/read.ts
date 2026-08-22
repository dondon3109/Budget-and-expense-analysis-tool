import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  mobileSyncAcknowledgeResponseSchema,
  mobileSyncSnapshotResponseSchema,
  type MobileSyncAcknowledgeRequest,
  type MobileSyncAcknowledgeResponse,
  type MobileSyncPullRequest,
  type MobileSyncPullResponse,
  type MobileSyncSnapshotRequest,
  type MobileSyncSnapshotResponse,
} from "@zoption/shared";

import { HttpError } from "../../errors";
import type { Bindings } from "../../types";
import {
  atomicMobileSyncPage,
  decodeMobileSyncChange,
  decodeMobileSyncCursor,
  decodeMobileSyncSnapshotCursor,
  encodeMobileSyncCursor,
  encodeMobileSyncSnapshotCursor,
  type MobileSyncChangeRow,
} from "./protocol";

export type MobileSyncEntitlementReader = (env: Bindings, tenantId: string) => Promise<boolean>;

export async function snapshotMobileSync(
  env: Bindings,
  tenantId: string,
  input: MobileSyncSnapshotRequest,
  readEntitlement: MobileSyncEntitlementReader,
): Promise<MobileSyncSnapshotResponse> {
  let snapshotSequence: number;
  if (input.snapshotCursor === null) {
    const state = await env.DB.prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
      .bind(tenantId)
      .first<{ sequence: number }>();
    snapshotSequence = Number(state?.sequence ?? 0);
    await env.DB.prepare(
      `INSERT INTO mobile_sync_clients (
        tenant_id, client_id, acknowledged_sequence, last_seen_at, expires_at,
        snapshot_sequence, snapshot_expires_at
      ) VALUES (?, ?, 0, datetime('now'), datetime('now', '+90 days'), ?, datetime('now', '+1 day'))
      ON CONFLICT (tenant_id, client_id) DO UPDATE SET
        last_seen_at = datetime('now'),
        expires_at = datetime('now', '+90 days'),
        snapshot_sequence = excluded.snapshot_sequence,
        snapshot_expires_at = excluded.snapshot_expires_at`,
    )
      .bind(tenantId, input.clientId, snapshotSequence)
      .run();
  } else {
    snapshotSequence = decodeMobileSyncSnapshotCursor(input.snapshotCursor);
    const client = await env.DB.prepare(
      `SELECT snapshot_sequence AS snapshotSequence
       FROM mobile_sync_clients
       WHERE tenant_id = ? AND client_id = ?
         AND snapshot_sequence = ? AND snapshot_expires_at >= datetime('now')`,
    )
      .bind(tenantId, input.clientId, snapshotSequence)
      .first<{ snapshotSequence: number }>();
    if (!client) {
      throw new HttpError(
        409,
        "full_resync_required",
        "This full snapshot expired or belongs to another installation. Restart it safely.",
        { reason: "snapshot_session_expired" },
      );
    }
    await env.DB.prepare(
      `UPDATE mobile_sync_clients
       SET last_seen_at = datetime('now'), expires_at = datetime('now', '+90 days')
       WHERE tenant_id = ? AND client_id = ?`,
    )
      .bind(tenantId, input.clientId)
      .run();
  }

  const result = await env.DB.prepare(
    `WITH ranked AS (
      SELECT changes.sequence, changes.entity_type AS entityType,
        changes.entity_id AS entityId, changes.row_revision AS rowRevision,
        changes.operation, changes.payload_json AS payloadJson,
        changes.server_updated_at AS serverUpdatedAt,
        groups.atomic_group_id AS atomicGroupId,
        ROW_NUMBER() OVER (
          PARTITION BY changes.entity_type, changes.entity_id
          ORDER BY changes.sequence DESC
        ) AS entityRank
      FROM mobile_sync_changes changes
      LEFT JOIN mobile_sync_change_groups groups
        ON groups.tenant_id = changes.tenant_id AND groups.sequence = changes.sequence
      WHERE changes.tenant_id = ? AND changes.sequence <= ?
    ), grouped AS (
      SELECT ranked.*, (
        SELECT COUNT(*) FROM ranked partner
        WHERE partner.atomicGroupId = ranked.atomicGroupId
          AND partner.entityRank = 1 AND partner.operation = 'upsert'
      ) AS groupSize
      FROM ranked
    ), ordered AS (
      SELECT sequence, entityType, entityId, rowRevision, operation, payloadJson,
        serverUpdatedAt,
        CASE WHEN groupSize = 2 THEN atomicGroupId ELSE NULL END AS atomicGroupId,
        ROW_NUMBER() OVER (
          ORDER BY CASE entityType
            WHEN 'account' THEN 1 WHEN 'category' THEN 2 ELSE 3 END,
            COALESCE(atomicGroupId, entityId), entityId
        ) - 1 AS snapshotPosition
      FROM grouped WHERE entityRank = 1 AND operation = 'upsert'
    )
    SELECT sequence, entityType, entityId, rowRevision, operation, payloadJson,
      serverUpdatedAt, atomicGroupId
    FROM ordered WHERE snapshotPosition >= ?
    ORDER BY snapshotPosition LIMIT ?`,
  )
    .bind(tenantId, snapshotSequence, input.offset, input.limit + 2)
    .all<MobileSyncChangeRow>();
  const page = atomicMobileSyncPage(result.results, input.limit);
  const hasPro = page.some((change) => change.entityType === "category")
    ? await readEntitlement(env, tenantId)
    : false;
  const changes = page.map((change) => decodeMobileSyncChange(change, hasPro));
  const snapshotCursor = encodeMobileSyncSnapshotCursor(snapshotSequence);
  return mobileSyncSnapshotResponseSchema.parse({
    protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
    snapshotCursor,
    changes,
    nextOffset: input.offset + page.length,
    hasMore: result.results.length > page.length,
    resumeCursor: encodeMobileSyncCursor(snapshotSequence),
  });
}

export async function acknowledgeMobileSyncClient(
  env: Bindings,
  tenantId: string,
  input: MobileSyncAcknowledgeRequest,
): Promise<MobileSyncAcknowledgeResponse> {
  const acknowledgedSequence = decodeMobileSyncCursor(input.cursor);
  const state = await env.DB.prepare(
    `SELECT sequence, retention_floor_sequence AS retentionFloorSequence
     FROM mobile_sync_state WHERE tenant_id = ?`,
  )
    .bind(tenantId)
    .first<{ sequence: number; retentionFloorSequence: number }>();
  const currentSequence = Number(state?.sequence ?? 0);
  const retentionFloorSequence = Number(state?.retentionFloorSequence ?? 0);
  if (acknowledgedSequence > currentSequence || acknowledgedSequence < retentionFloorSequence) {
    throw new HttpError(
      409,
      "full_resync_required",
      "This device cursor is outside the retained synchronization window.",
      { reason: "acknowledgement_outside_retention_window" },
    );
  }
  if (acknowledgedSequence > 0) {
    const boundary = await env.DB.prepare(
      `SELECT current_group.atomic_group_id AS currentGroupId,
              next_group.atomic_group_id AS nextGroupId
       FROM (SELECT 1) marker
       LEFT JOIN mobile_sync_change_groups current_group
         ON current_group.tenant_id = ? AND current_group.sequence = ?
       LEFT JOIN mobile_sync_change_groups next_group
         ON next_group.tenant_id = ? AND next_group.sequence = ?`,
    )
      .bind(tenantId, acknowledgedSequence, tenantId, acknowledgedSequence + 1)
      .first<{ currentGroupId: string | null; nextGroupId: string | null }>();
    if (boundary?.currentGroupId && boundary.currentGroupId === boundary.nextGroupId) {
      throw new HttpError(
        400,
        "invalid_sync_cursor",
        "A device cannot acknowledge only half of an atomic transfer.",
      );
    }
  }

  await env.DB.prepare(
    `INSERT INTO mobile_sync_clients (
      tenant_id, client_id, acknowledged_sequence, last_seen_at, expires_at
    ) VALUES (?, ?, ?, datetime('now'), datetime('now', '+90 days'))
    ON CONFLICT (tenant_id, client_id) DO UPDATE SET
      acknowledged_sequence = MAX(acknowledged_sequence, excluded.acknowledged_sequence),
      last_seen_at = datetime('now'),
      expires_at = datetime('now', '+90 days'),
      snapshot_sequence = CASE
        WHEN snapshot_sequence IS NOT NULL
          AND excluded.acknowledged_sequence >= snapshot_sequence THEN NULL
        ELSE snapshot_sequence END,
      snapshot_expires_at = CASE
        WHEN snapshot_sequence IS NOT NULL
          AND excluded.acknowledged_sequence >= snapshot_sequence THEN NULL
        ELSE snapshot_expires_at END`,
  )
    .bind(tenantId, input.clientId, acknowledgedSequence)
    .run();
  const client = await env.DB.prepare(
    `SELECT acknowledged_sequence AS acknowledgedSequence
     FROM mobile_sync_clients WHERE tenant_id = ? AND client_id = ?`,
  )
    .bind(tenantId, input.clientId)
    .first<{ acknowledgedSequence: number }>();
  if (Number(client?.acknowledgedSequence ?? 0) !== acknowledgedSequence) {
    throw new HttpError(
      409,
      "full_resync_required",
      "This installation reported an older cursor than it previously acknowledged.",
      { reason: "client_cursor_regressed" },
    );
  }
  return mobileSyncAcknowledgeResponseSchema.parse({
    protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
    acknowledgedCursor: encodeMobileSyncCursor(acknowledgedSequence),
    retentionFloorCursor: encodeMobileSyncCursor(retentionFloorSequence),
  });
}

export async function pullMobileSyncChanges(
  env: Bindings,
  tenantId: string,
  input: MobileSyncPullRequest,
  readEntitlement: MobileSyncEntitlementReader,
): Promise<MobileSyncPullResponse> {
  const cursorSequence = decodeMobileSyncCursor(input.cursor);
  const state = await env.DB.prepare(
    `SELECT sequence, retention_floor_sequence AS retentionFloorSequence
     FROM mobile_sync_state WHERE tenant_id = ?`,
  )
    .bind(tenantId)
    .first<{ sequence: number; retentionFloorSequence: number }>();
  const currentSequence = Number(state?.sequence ?? 0);
  const retentionFloorSequence = Number(state?.retentionFloorSequence ?? 0);
  if (cursorSequence < retentionFloorSequence) {
    throw new HttpError(
      409,
      "full_resync_required",
      "This device cursor has expired. Start a safe full resynchronization.",
      { reason: "cursor_expired" },
    );
  }
  if (cursorSequence > currentSequence) {
    throw new HttpError(
      409,
      "full_resync_required",
      "This device cursor is no longer valid. Start a safe full resynchronization.",
      { reason: "cursor_ahead" },
    );
  }

  const result = await env.DB.prepare(
    `SELECT
      changes.sequence,
      changes.entity_type AS entityType,
      changes.entity_id AS entityId,
      changes.row_revision AS rowRevision,
      changes.operation,
      changes.payload_json AS payloadJson,
      changes.server_updated_at AS serverUpdatedAt,
      groups.atomic_group_id AS atomicGroupId
    FROM mobile_sync_changes changes
    LEFT JOIN mobile_sync_change_groups groups
      ON groups.tenant_id = changes.tenant_id AND groups.sequence = changes.sequence
    WHERE changes.tenant_id = ? AND changes.sequence > ?
    ORDER BY changes.sequence
    LIMIT ?`,
  )
    .bind(tenantId, cursorSequence, input.limit + 2)
    .all<MobileSyncChangeRow>();

  const first = result.results[0];
  if (first?.atomicGroupId && cursorSequence > 0) {
    const previous = await env.DB.prepare(
      `SELECT atomic_group_id AS atomicGroupId
       FROM mobile_sync_change_groups
       WHERE tenant_id = ? AND sequence = ?`,
    )
      .bind(tenantId, cursorSequence)
      .first<{ atomicGroupId: string }>();
    if (previous?.atomicGroupId === first.atomicGroupId) {
      throw new HttpError(
        409,
        "full_resync_required",
        "This device cursor splits an atomic transfer. Start a safe full resynchronization.",
        { reason: "cursor_inside_atomic_transfer" },
      );
    }
  }
  const page = atomicMobileSyncPage(result.results, input.limit);
  const hasPro = page.some((change) => change.entityType === "category")
    ? await readEntitlement(env, tenantId)
    : false;
  const changes = page.map((change) => decodeMobileSyncChange(change, hasPro));
  const nextSequence = page.at(-1)?.sequence ?? cursorSequence;

  return {
    protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
    changes,
    nextCursor: encodeMobileSyncCursor(nextSequence),
    hasMore: nextSequence < currentSequence,
  };
}
