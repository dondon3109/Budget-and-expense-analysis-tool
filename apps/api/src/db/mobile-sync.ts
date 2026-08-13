import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  mobileSyncCategorySnapshotSchema,
  mobileSyncChangeSchema,
  type MobileSyncChange,
  type MobileSyncPullRequest,
  type MobileSyncPullResponse,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { hasProEntitlement } from "./billing";

interface ChangeRow {
  sequence: number;
  entityType: "account" | "category" | "transaction";
  entityId: string;
  rowRevision: number;
  operation: "upsert" | "delete";
  payloadJson: string | null;
  serverUpdatedAt: string;
}

export interface MobileSyncRepository {
  pull(
    env: Bindings,
    tenantId: string,
    input: MobileSyncPullRequest,
  ): Promise<MobileSyncPullResponse>;
}

type EntitlementReader = (env: Bindings, tenantId: string) => Promise<boolean>;

export function encodeMobileSyncCursor(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Cannot encode an invalid mobile sync sequence.");
  }
  return `v1.${sequence.toString(36)}`;
}

export function decodeMobileSyncCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  const encoded = cursor.slice(3);
  const sequence = Number.parseInt(encoded, 36);
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    encodeMobileSyncCursor(sequence) !== cursor
  ) {
    throw new HttpError(400, "invalid_sync_cursor", "Restart synchronization from this device.");
  }
  return sequence;
}

function decodePayload(row: ChangeRow, hasPro: boolean): MobileSyncChange {
  try {
    let payload: unknown = null;
    if (row.operation === "upsert") {
      if (!row.payloadJson) throw new Error("missing_payload");
      payload = JSON.parse(row.payloadJson) as unknown;
      if (row.entityType === "category") {
        const category = mobileSyncCategorySnapshotSchema.parse(payload);
        payload = {
          ...category,
          locked: category.requiredPlan === "zoption_pro" && !hasPro,
        };
      }
    }
    return mobileSyncChangeSchema.parse({
      entityType: row.entityType,
      entityId: row.entityId,
      revision: row.rowRevision,
      operation: row.operation,
      serverUpdatedAt: row.serverUpdatedAt,
      payload,
    });
  } catch {
    // Do not let Zod include a financial payload in the global error log.
    throw new Error("Stored mobile synchronization data failed validation.");
  }
}

export function createMobileSyncRepository(
  readEntitlement: EntitlementReader = hasProEntitlement,
): MobileSyncRepository {
  return {
    async pull(env, tenantId, input) {
      const cursorSequence = decodeMobileSyncCursor(input.cursor);
      const state = await env.DB.prepare(
        "SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?",
      )
        .bind(tenantId)
        .first<{ sequence: number }>();
      const currentSequence = Number(state?.sequence ?? 0);
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
          sequence,
          entity_type AS entityType,
          entity_id AS entityId,
          row_revision AS rowRevision,
          operation,
          payload_json AS payloadJson,
          server_updated_at AS serverUpdatedAt
        FROM mobile_sync_changes
        WHERE tenant_id = ? AND sequence > ?
        ORDER BY sequence
        LIMIT ?`,
      )
        .bind(tenantId, cursorSequence, input.limit + 1)
        .all<ChangeRow>();

      const hasMore = result.results.length > input.limit;
      const page = hasMore ? result.results.slice(0, input.limit) : result.results;
      const hasPro = page.some((change) => change.entityType === "category")
        ? await readEntitlement(env, tenantId)
        : false;
      const changes = page.map((change) => decodePayload(change, hasPro));
      const nextSequence = page.at(-1)?.sequence ?? cursorSequence;

      return {
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes,
        nextCursor: encodeMobileSyncCursor(nextSequence),
        hasMore,
      };
    },
  };
}

export const mobileSyncRepository = createMobileSyncRepository();
