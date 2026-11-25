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
  type BillingTier,
} from "@zoption/shared";

import { HttpError } from "../../errors";
import type { Bindings } from "../../types";
import {
  atomicMobileSyncPage,
  isSubscriptionGroup,
  decodeMobileSyncChange,
  decodeMobileSyncCursor,
  decodeMobileSyncSnapshotCursor,
  encodeMobileSyncCursor,
  encodeMobileSyncSnapshotCursor,
  type MobileSyncChangeRow,
} from "./protocol";

/** Reads the tenant's tier, which decides each category's `locked` flag and plan-gated pushes. */
export type MobileSyncEntitlementReader = (env: Bindings, tenantId: string) => Promise<BillingTier>;

const BUCKET_3_ENTITY_TYPES = [
  "transaction",
  "budget",
  "goal",
  "debt",
  "subscription",
  "event",
  "remittance",
] as const;

// D1 caps compound SELECT terms at 5 and bound parameters at 100 per statement.
const MAX_COMPOUND_ARMS = 4;
const HYDRATE_CHUNK_SIZE = 90;
const MAX_STORED_CHECKPOINTS = 8;

type SnapshotEntityType = MobileSyncChangeRow["entityType"] | "remittance";
type SnapshotBucket = 1 | 2 | 3;

interface SnapshotCursorKey {
  bucket: SnapshotBucket;
  sortKey: string;
  entityId: string;
  entityType: string;
}

interface SnapshotCheckpoint {
  offset: number;
  after: SnapshotCursorKey;
  exhausted?: string[];
}

interface SnapshotCheckpointState {
  snapshotSequence: number;
  checkpoints: SnapshotCheckpoint[];
}

interface SnapshotKeyEntry {
  bucket: SnapshotBucket;
  sequence: number;
  entityType: SnapshotEntityType;
  entityId: string;
  sortKey: string;
  atomicGroupId: string | null;
}

interface HydratedChangeRow {
  sequence: number;
  entityType: MobileSyncChangeRow["entityType"];
  entityId: string;
  rowRevision: number;
  operation: "upsert" | "delete";
  payloadJson: string | null;
  serverUpdatedAt: string;
}

/** Matches SQLite BINARY collation (UTF-8 / Unicode code-point order). */
function compareBinaryText(a: string, b: string): number {
  if (a === b) return 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length;) {
    const codeA = a.codePointAt(index)!;
    const codeB = b.codePointAt(index)!;
    if (codeA !== codeB) return codeA < codeB ? -1 : 1;
    index += codeA > 0xffff ? 2 : 1;
  }
  return a.length < b.length ? -1 : 1;
}

function compareBucket3Key(
  a: Pick<SnapshotCursorKey, "sortKey" | "entityId" | "entityType">,
  b: Pick<SnapshotCursorKey, "sortKey" | "entityId" | "entityType">,
): number {
  return (
    compareBinaryText(a.sortKey, b.sortKey) ||
    compareBinaryText(a.entityId, b.entityId) ||
    compareBinaryText(a.entityType, b.entityType)
  );
}

function parseCheckpointState(
  raw: string | null | undefined,
  snapshotSequence: number,
): SnapshotCheckpoint[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<SnapshotCheckpointState>;
    if (
      !parsed ||
      parsed.snapshotSequence !== snapshotSequence ||
      !Array.isArray(parsed.checkpoints)
    ) {
      return [];
    }
    return parsed.checkpoints.filter(
      (cp): cp is SnapshotCheckpoint =>
        Boolean(cp) &&
        Number.isSafeInteger(cp.offset) &&
        cp.offset > 0 &&
        Boolean(cp.after) &&
        (cp.after.bucket === 1 || cp.after.bucket === 2 || cp.after.bucket === 3) &&
        typeof cp.after.sortKey === "string" &&
        typeof cp.after.entityId === "string" &&
        typeof cp.after.entityType === "string" &&
        (cp.exhausted === undefined ||
          (Array.isArray(cp.exhausted) && cp.exhausted.every((name) => typeof name === "string"))),
    );
  } catch {
    return [];
  }
}

function mergeCheckpoints(
  existing: SnapshotCheckpoint[],
  next: SnapshotCheckpoint,
): SnapshotCheckpoint[] {
  const byOffset = new Map<number, SnapshotCheckpoint>();
  for (const cp of existing) byOffset.set(cp.offset, cp);
  byOffset.set(next.offset, next);
  return [...byOffset.values()].sort((a, b) => a.offset - b.offset).slice(-MAX_STORED_CHECKPOINTS);
}

function findCheckpointForOffset(
  checkpoints: SnapshotCheckpoint[],
  offset: number,
): SnapshotCheckpoint | null {
  let best: SnapshotCheckpoint | null = null;
  for (const cp of checkpoints) {
    if (cp.offset <= offset && (!best || cp.offset > best.offset)) {
      best = cp;
    }
  }
  return best;
}

async function readSingleEntityBucket(
  env: Bindings,
  tenantId: string,
  snapshotSequence: number,
  entityType: "account" | "category",
  bucket: 1 | 2,
  afterEntityId: string | null,
  limit: number,
): Promise<SnapshotKeyEntry[]> {
  if (limit <= 0) return [];
  const hasAfter = afterEntityId !== null;
  const afterFilter = hasAfter ? "AND entity_id > ?3" : "";
  const seqParam = hasAfter ? "?4" : "?3";
  const limitParam = hasAfter ? "?5" : "?4";
  const statement = env.DB.prepare(`
    WITH latest AS (
      SELECT entity_id AS entityId, MAX(sequence) AS sequence, operation
      FROM mobile_sync_changes INDEXED BY mobile_sync_changes_snapshot_idx
      WHERE tenant_id = ?1
        AND entity_type = ?2
        ${afterFilter}
        AND sequence <= ${seqParam}
      GROUP BY entity_id
      ORDER BY entity_id
    )
    SELECT sequence, entityId
    FROM latest
    WHERE operation = 'upsert'
    LIMIT ${limitParam}`);
  const result = hasAfter
    ? await statement
        .bind(tenantId, entityType, afterEntityId, snapshotSequence, limit)
        .all<{ sequence: number; entityId: string }>()
    : await statement
        .bind(tenantId, entityType, snapshotSequence, limit)
        .all<{ sequence: number; entityId: string }>();

  return result.results.map((row) => ({
    bucket,
    sequence: Number(row.sequence),
    entityType,
    entityId: row.entityId,
    sortKey: row.entityId,
    atomicGroupId: null,
  }));
}

function ungroupedBucket3ArmSql(entityType: string, hasAfter: boolean): string {
  const afterFilter = hasAfter ? "AND entity_id >= ?2" : "";
  const seqParam = hasAfter ? "?3" : "?2";
  const limitParam = hasAfter ? "?4" : "?3";
  return `
    SELECT entityType, entityId, sequence FROM (
      WITH latest AS (
        SELECT '${entityType}' AS entityType,
               entity_id AS entityId,
               MAX(sequence) AS sequence,
               operation
        FROM mobile_sync_changes INDEXED BY mobile_sync_changes_snapshot_idx
        WHERE tenant_id = ?1
          AND entity_type = '${entityType}'
          ${afterFilter}
          AND sequence <= ${seqParam}
        GROUP BY entity_id
        ORDER BY entity_id
      )
      SELECT entityType, entityId, sequence
      FROM latest
      WHERE operation = 'upsert'
        AND NOT EXISTS (
          SELECT 1 FROM mobile_sync_change_groups g
          WHERE g.tenant_id = ?1 AND g.sequence = latest.sequence
        )
      LIMIT ${limitParam}
    )`;
}

async function readUngroupedBucket3(
  env: Bindings,
  tenantId: string,
  snapshotSequence: number,
  activeTypes: readonly SnapshotEntityType[],
  after: SnapshotCursorKey | null,
  needed: number,
): Promise<{ rows: SnapshotKeyEntry[]; exhaustedTypes: SnapshotEntityType[] }> {
  if (activeTypes.length === 0 || needed <= 0) {
    return { rows: [], exhaustedTypes: [] };
  }
  const afterKey = after?.bucket === 3 ? after.sortKey : null;
  // When resuming after a grouped key whose sortKey < entityId, at most one ungrouped row per
  // entityType can satisfy entityId === afterKey and still sort <= after. Request 1 extra row
  // per arm so filtering out that single item never short-changes `needed`.
  const armLimit = afterKey !== null ? needed + 1 : needed;
  const rows: SnapshotKeyEntry[] = [];
  const countsByType = new Map<string, number>();

  for (let start = 0; start < activeTypes.length; start += MAX_COMPOUND_ARMS) {
    const chunk = activeTypes.slice(start, start + MAX_COMPOUND_ARMS);
    const sql = chunk
      .map((entityType) => ungroupedBucket3ArmSql(entityType, afterKey !== null))
      .join("\nUNION ALL\n");
    const statement = env.DB.prepare(sql);
    const result =
      afterKey !== null
        ? await statement
            .bind(tenantId, afterKey, snapshotSequence, armLimit)
            .all<{ entityType: SnapshotEntityType; entityId: string; sequence: number }>()
        : await statement
            .bind(tenantId, snapshotSequence, armLimit)
            .all<{ entityType: SnapshotEntityType; entityId: string; sequence: number }>();

    for (const row of result.results) {
      countsByType.set(row.entityType, (countsByType.get(row.entityType) ?? 0) + 1);
      const entry: SnapshotKeyEntry = {
        bucket: 3,
        sequence: Number(row.sequence),
        entityType: row.entityType,
        entityId: row.entityId,
        sortKey: row.entityId,
        atomicGroupId: null,
      };
      if (after?.bucket === 3 && compareBucket3Key(entry, after) <= 0) continue;
      rows.push(entry);
    }
  }

  const exhaustedTypes = activeTypes.filter((type) => (countsByType.get(type) ?? 0) < armLimit);
  return { rows, exhaustedTypes };
}

interface RawGroupedRow {
  rawGroupId: string;
  sequence: number;
  entityType: SnapshotEntityType;
  entityId: string;
}

function groupedBucket3Sql(
  whereClause: string,
  seqParam: string,
  orderBy: string,
  limitClause: string,
): string {
  return `
    SELECT g.atomic_group_id AS rawGroupId,
           g.sequence AS sequence,
           c.entity_type AS entityType,
           c.entity_id AS entityId
    FROM mobile_sync_change_groups g INDEXED BY mobile_sync_change_groups_atomic_idx
    JOIN mobile_sync_changes c
      ON c.tenant_id = g.tenant_id AND c.sequence = g.sequence
    WHERE g.tenant_id = ?1
      ${whereClause}
      AND g.sequence <= ${seqParam}
      AND c.operation = 'upsert'
      AND c.entity_type NOT IN ('account', 'category')
      AND NOT EXISTS (
        SELECT 1 FROM mobile_sync_changes newer INDEXED BY mobile_sync_changes_snapshot_idx
        WHERE newer.tenant_id = ?1
          AND newer.entity_type = c.entity_type
          AND newer.entity_id = c.entity_id
          AND newer.sequence > g.sequence
          AND newer.sequence <= ${seqParam}
      )
    ORDER BY ${orderBy}
    ${limitClause}`;
}

async function readGroupedBucket3(
  env: Bindings,
  tenantId: string,
  snapshotSequence: number,
  after: SnapshotCursorKey | null,
  needed: number,
): Promise<{ rows: SnapshotKeyEntry[]; exhausted: boolean }> {
  if (needed <= 0) return { rows: [], exhausted: false };
  const afterCursor = after?.bucket === 3 ? after : null;
  const batchSize = Math.max(needed * 2, 64);
  let cursorGroupId: string | null = afterCursor ? afterCursor.sortKey : null;
  let cursorInclusive = afterCursor !== null;

  const accepted: SnapshotKeyEntry[] = [];
  let reachedEnd = false;

  while (accepted.length < needed) {
    const lowerClause =
      cursorGroupId === null
        ? ""
        : cursorInclusive
          ? "AND g.atomic_group_id >= ?2"
          : "AND g.atomic_group_id > ?2";
    const seqParam = cursorGroupId === null ? "?2" : "?3";
    const limitParam = cursorGroupId === null ? "?3" : "?4";
    const statement = env.DB.prepare(
      groupedBucket3Sql(
        lowerClause,
        seqParam,
        "g.atomic_group_id, g.sequence",
        `LIMIT ${limitParam}`,
      ),
    );
    const batch =
      cursorGroupId === null
        ? await statement.bind(tenantId, snapshotSequence, batchSize).all<RawGroupedRow>()
        : await statement
            .bind(tenantId, cursorGroupId, snapshotSequence, batchSize)
            .all<RawGroupedRow>();

    const rows = batch.results;
    if (rows.length === 0) {
      reachedEnd = true;
      break;
    }

    const lastRow = rows[rows.length - 1]!;
    if (rows.length === batchSize) {
      // Complete the trailing atomic_group_id so its live group size is never undercounted.
      const tail = await env.DB.prepare(
        groupedBucket3Sql("AND g.atomic_group_id = ?2 AND g.sequence > ?3", "?4", "g.sequence", ""),
      )
        .bind(tenantId, lastRow.rawGroupId, Number(lastRow.sequence), snapshotSequence)
        .all<RawGroupedRow>();
      rows.push(...tail.results);
    } else {
      reachedEnd = true;
    }

    const byGroup = new Map<string, RawGroupedRow[]>();
    for (const row of rows) {
      const list = byGroup.get(row.rawGroupId);
      if (list) list.push(row);
      else byGroup.set(row.rawGroupId, [row]);
    }
    for (const [rawGroupId, groupRows] of byGroup) {
      const atomicGroupId = groupRows.length === 2 ? rawGroupId : null;
      const orderedGroup = groupRows
        .map<SnapshotKeyEntry>((row) => ({
          bucket: 3,
          sequence: Number(row.sequence),
          entityType: row.entityType,
          entityId: row.entityId,
          sortKey: rawGroupId,
          atomicGroupId,
        }))
        .sort(compareBucket3Key);
      for (const entry of orderedGroup) {
        if (afterCursor && compareBucket3Key(entry, afterCursor) <= 0) continue;
        accepted.push(entry);
      }
    }

    if (reachedEnd) break;
    cursorGroupId = lastRow.rawGroupId;
    cursorInclusive = false;
  }

  return {
    rows: accepted.slice(0, needed),
    exhausted: reachedEnd && accepted.length <= needed,
  };
}

async function readBucket3Slice(
  env: Bindings,
  tenantId: string,
  snapshotSequence: number,
  after: SnapshotCursorKey | null,
  alreadyExhausted: ReadonlySet<string>,
  needed: number,
): Promise<{
  rows: SnapshotKeyEntry[];
  ungroupedRows: SnapshotKeyEntry[];
  groupedRows: SnapshotKeyEntry[];
  exhaustedUngrouped: SnapshotEntityType[];
  exhaustedGrouped: boolean;
}> {
  if (needed <= 0) {
    return {
      rows: [],
      ungroupedRows: [],
      groupedRows: [],
      exhaustedUngrouped: [],
      exhaustedGrouped: false,
    };
  }
  const activeTypes = BUCKET_3_ENTITY_TYPES.filter((type) => !alreadyExhausted.has(type));
  const [ungrouped, grouped] = await Promise.all([
    readUngroupedBucket3(env, tenantId, snapshotSequence, activeTypes, after, needed),
    alreadyExhausted.has("grouped")
      ? Promise.resolve({ rows: [] as SnapshotKeyEntry[], exhausted: true })
      : readGroupedBucket3(env, tenantId, snapshotSequence, after, needed),
  ]);

  const merged = [...ungrouped.rows, ...grouped.rows].sort(compareBucket3Key).slice(0, needed);
  return {
    rows: merged,
    ungroupedRows: ungrouped.rows,
    groupedRows: grouped.rows,
    exhaustedUngrouped: ungrouped.exhaustedTypes,
    exhaustedGrouped: grouped.exhausted,
  };
}

async function hydrateSnapshotPage(
  env: Bindings,
  tenantId: string,
  entries: SnapshotKeyEntry[],
): Promise<MobileSyncChangeRow[]> {
  if (entries.length === 0) return [];
  const bySequence = new Map<number, HydratedChangeRow>();
  for (let start = 0; start < entries.length; start += HYDRATE_CHUNK_SIZE) {
    const chunk = entries.slice(start, start + HYDRATE_CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `?${index + 2}`).join(", ");
    const rows = await env.DB.prepare(
      `SELECT sequence,
              entity_type AS entityType,
              entity_id AS entityId,
              row_revision AS rowRevision,
              operation,
              payload_json AS payloadJson,
              server_updated_at AS serverUpdatedAt
       FROM mobile_sync_changes
       WHERE tenant_id = ?1 AND sequence IN (${placeholders})`,
    )
      .bind(tenantId, ...chunk.map((entry) => entry.sequence))
      .all<HydratedChangeRow>();
    for (const row of rows.results) {
      bySequence.set(Number(row.sequence), row);
    }
  }
  return entries.map((entry) => {
    const row = bySequence.get(entry.sequence);
    if (!row) {
      throw new Error("Stored mobile synchronization snapshot row could not be hydrated.");
    }
    return {
      sequence: Number(row.sequence),
      entityType: row.entityType,
      entityId: row.entityId,
      rowRevision: Number(row.rowRevision),
      operation: row.operation,
      payloadJson: row.payloadJson,
      serverUpdatedAt: row.serverUpdatedAt,
      atomicGroupId: entry.atomicGroupId,
    };
  });
}

export async function snapshotMobileSync(
  env: Bindings,
  tenantId: string,
  input: MobileSyncSnapshotRequest,
  readEntitlement: MobileSyncEntitlementReader,
): Promise<MobileSyncSnapshotResponse> {
  let snapshotSequence: number;
  let existingCheckpoints: SnapshotCheckpoint[] = [];

  if (input.snapshotCursor === null) {
    const state = await env.DB.prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
      .bind(tenantId)
      .first<{ sequence: number }>();
    snapshotSequence = Number(state?.sequence ?? 0);
    await env.DB.prepare(
      `INSERT INTO mobile_sync_clients (
        tenant_id, client_id, acknowledged_sequence, last_seen_at, expires_at,
        snapshot_sequence, snapshot_expires_at, snapshot_checkpoint_json
      ) VALUES (?, ?, 0, datetime('now'), datetime('now', '+90 days'), ?, datetime('now', '+1 day'), NULL)
      ON CONFLICT (tenant_id, client_id) DO UPDATE SET
        last_seen_at = datetime('now'),
        expires_at = datetime('now', '+90 days'),
        snapshot_sequence = excluded.snapshot_sequence,
        snapshot_expires_at = excluded.snapshot_expires_at,
        snapshot_checkpoint_json = NULL`,
    )
      .bind(tenantId, input.clientId, snapshotSequence)
      .run();
  } else {
    snapshotSequence = decodeMobileSyncSnapshotCursor(input.snapshotCursor);
    const client = await env.DB.prepare(
      `SELECT snapshot_sequence AS snapshotSequence,
              snapshot_checkpoint_json AS snapshotCheckpointJson
       FROM mobile_sync_clients
       WHERE tenant_id = ? AND client_id = ?
         AND snapshot_sequence = ? AND snapshot_expires_at >= datetime('now')`,
    )
      .bind(tenantId, input.clientId, snapshotSequence)
      .first<{ snapshotSequence: number; snapshotCheckpointJson: string | null }>();
    if (!client) {
      throw new HttpError(
        409,
        "full_resync_required",
        "This full snapshot expired or belongs to another installation. Restart it safely.",
        { reason: "snapshot_session_expired" },
      );
    }
    existingCheckpoints = parseCheckpointState(client.snapshotCheckpointJson, snapshotSequence);
  }

  const snapshotCursor = encodeMobileSyncSnapshotCursor(snapshotSequence);
  const resumeCursor = encodeMobileSyncCursor(snapshotSequence);
  if (snapshotSequence === 0) {
    if (input.snapshotCursor !== null) {
      await env.DB.prepare(
        `UPDATE mobile_sync_clients
         SET last_seen_at = datetime('now'), expires_at = datetime('now', '+90 days')
         WHERE tenant_id = ? AND client_id = ?`,
      )
        .bind(tenantId, input.clientId)
        .run();
    }
    return mobileSyncSnapshotResponseSchema.parse({
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      snapshotCursor,
      changes: [],
      nextOffset: input.offset,
      hasMore: false,
      resumeCursor,
    });
  }

  const checkpoint = findCheckpointForOffset(existingCheckpoints, input.offset);
  const after = checkpoint?.after ?? null;
  const skipCount = checkpoint ? input.offset - checkpoint.offset : input.offset;
  const totalNeeded = skipCount + input.limit + 2;
  const exhausted = new Set<string>(checkpoint?.exhausted ?? []);

  const collected: SnapshotKeyEntry[] = [];
  if (!after || after.bucket === 1) {
    collected.push(
      ...(await readSingleEntityBucket(
        env,
        tenantId,
        snapshotSequence,
        "account",
        1,
        after?.bucket === 1 ? after.entityId : null,
        totalNeeded - collected.length,
      )),
    );
  }
  if (collected.length < totalNeeded && (!after || after.bucket <= 2)) {
    collected.push(
      ...(await readSingleEntityBucket(
        env,
        tenantId,
        snapshotSequence,
        "category",
        2,
        after?.bucket === 2 ? after.entityId : null,
        totalNeeded - collected.length,
      )),
    );
  }
  let bucket3Result: Awaited<ReturnType<typeof readBucket3Slice>> | null = null;
  if (collected.length < totalNeeded) {
    bucket3Result = await readBucket3Slice(
      env,
      tenantId,
      snapshotSequence,
      after,
      exhausted,
      totalNeeded - collected.length,
    );
    collected.push(...bucket3Result.rows);
  }

  const windowEntries = collected.slice(skipCount, skipCount + input.limit + 2);
  const page = atomicMobileSyncPage(
    await hydrateSnapshotPage(env, tenantId, windowEntries),
    input.limit,
  );
  const hasMore = windowEntries.length > page.length;
  const nextOffset = input.offset + page.length;

  let nextCheckpointJson: string | null = null;
  if (page.length > 0 && hasMore) {
    const lastEntry = windowEntries[page.length - 1]!;
    const nextExhausted = new Set(exhausted);
    if (lastEntry.bucket === 3 && bucket3Result) {
      for (const type of bucket3Result.exhaustedUngrouped) {
        const allBeforeOrAtLast = bucket3Result.ungroupedRows
          .filter((row) => row.entityType === type)
          .every((row) => compareBucket3Key(row, lastEntry) <= 0);
        if (allBeforeOrAtLast) nextExhausted.add(type);
      }
      if (bucket3Result.exhaustedGrouped) {
        const allGroupedBeforeOrAtLast = bucket3Result.groupedRows.every(
          (row) => compareBucket3Key(row, lastEntry) <= 0,
        );
        if (allGroupedBeforeOrAtLast) nextExhausted.add("grouped");
      }
    }
    const updatedCheckpoints = mergeCheckpoints(existingCheckpoints, {
      offset: nextOffset,
      after: {
        bucket: lastEntry.bucket,
        sortKey: lastEntry.sortKey,
        entityId: lastEntry.entityId,
        entityType: lastEntry.entityType,
      },
      ...(nextExhausted.size > 0 ? { exhausted: [...nextExhausted] } : {}),
    });
    nextCheckpointJson = JSON.stringify({
      snapshotSequence,
      checkpoints: updatedCheckpoints,
    } satisfies SnapshotCheckpointState);
  }

  if (input.snapshotCursor !== null || nextCheckpointJson !== null) {
    await env.DB.prepare(
      `UPDATE mobile_sync_clients
       SET last_seen_at = datetime('now'),
           expires_at = datetime('now', '+90 days'),
           snapshot_checkpoint_json = COALESCE(?3, snapshot_checkpoint_json)
       WHERE tenant_id = ?1 AND client_id = ?2`,
    )
      .bind(tenantId, input.clientId, nextCheckpointJson)
      .run();
  }

  const tier = page.some((change) => change.entityType === "category")
    ? await readEntitlement(env, tenantId)
    : "free";
  const changes = page.map((change) => decodeMobileSyncChange(change, tier));
  return mobileSyncSnapshotResponseSchema.parse({
    protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
    snapshotCursor,
    changes,
    nextOffset,
    hasMore,
    resumeCursor,
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
    if (
      boundary?.currentGroupId &&
      !isSubscriptionGroup(boundary.currentGroupId) &&
      boundary.currentGroupId === boundary.nextGroupId
    ) {
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
        ELSE snapshot_expires_at END,
      snapshot_checkpoint_json = CASE
        WHEN snapshot_sequence IS NOT NULL
          AND excluded.acknowledged_sequence >= snapshot_sequence THEN NULL
        ELSE snapshot_checkpoint_json END`,
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
  if (first?.atomicGroupId && !isSubscriptionGroup(first.atomicGroupId) && cursorSequence > 0) {
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
  const tier = page.some((change) => change.entityType === "category")
    ? await readEntitlement(env, tenantId)
    : "free";
  const changes = page.map((change) => decodeMobileSyncChange(change, tier));
  const nextSequence = page.at(-1)?.sequence ?? cursorSequence;

  return {
    protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
    changes,
    nextCursor: encodeMobileSyncCursor(nextSequence),
    hasMore: nextSequence < currentSequence,
  };
}
