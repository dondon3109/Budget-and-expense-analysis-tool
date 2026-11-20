import { mobileSyncChangeSchema, type BillingTier, type MobileSyncChange } from "@zoption/shared";

import { HttpError } from "../../errors";
import { storedCategorySnapshotSchema, withCategoryLock } from "./push/snapshots";

export interface MobileSyncChangeRow {
  sequence: number;
  entityType:
    "account" | "category" | "transaction" | "budget" | "goal" | "debt" | "subscription" | "event";
  entityId: string;
  rowRevision: number;
  operation: "upsert" | "delete";
  payloadJson: string | null;
  serverUpdatedAt: string;
  atomicGroupId: string | null;
}

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

export function encodeMobileSyncSnapshotCursor(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Cannot encode an invalid mobile snapshot sequence.");
  }
  return `s1.${sequence.toString(36)}`;
}

export function decodeMobileSyncSnapshotCursor(cursor: string): number {
  const encoded = cursor.slice(3);
  const sequence = Number.parseInt(encoded, 36);
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    encodeMobileSyncSnapshotCursor(sequence) !== cursor
  ) {
    throw new HttpError(400, "invalid_snapshot_cursor", "Restart the safe full snapshot.");
  }
  return sequence;
}

export function decodeMobileSyncChange(
  row: MobileSyncChangeRow,
  tier: BillingTier,
): MobileSyncChange {
  try {
    let payload: unknown = null;
    if (row.operation === "upsert") {
      if (!row.payloadJson) throw new Error("missing_payload");
      payload = JSON.parse(row.payloadJson) as unknown;
      if (row.entityType === "category") {
        payload = withCategoryLock(storedCategorySnapshotSchema.parse(payload), tier);
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
    // Financial payload details must not escape through validation or global error logging.
    throw new Error("Stored mobile synchronization data failed validation.");
  }
}

/**
 * A bill's changes share the group `subscription:<id>` with no revision in it, so every later
 * edit, payment, or delete of that bill or its charge lands in the same group. Only a bill change
 * written together with its charge is one unit; a lone bill edit or delete is an ordinary change,
 * and a cursor may sit between two of that bill's changes. Transfer groups carry a revision and
 * stay strict pairs.
 */
export function isSubscriptionGroup(atomicGroupId: string | null): boolean {
  return atomicGroupId?.startsWith("subscription:") ?? false;
}

function isBillWithCharge(first: MobileSyncChangeRow, second: MobileSyncChangeRow | undefined) {
  if (!second || second.atomicGroupId !== first.atomicGroupId) return false;
  const kinds = [first.entityType, second.entityType];
  return kinds.includes("subscription") && kinds.includes("transaction");
}

export function atomicMobileSyncPage(
  rows: MobileSyncChangeRow[],
  limit: number,
): MobileSyncChangeRow[] {
  const page: MobileSyncChangeRow[] = [];
  for (let index = 0; index < rows.length;) {
    if (page.length >= limit) break;
    const row = rows[index]!;
    if (!row.atomicGroupId) {
      page.push(row);
      index += 1;
      continue;
    }
    if (isSubscriptionGroup(row.atomicGroupId)) {
      // Keep a bill and its charge on one page when they arrive together.
      const size = isBillWithCharge(row, rows[index + 1]) ? 2 : 1;
      if (page.length > 0 && page.length + size > limit) break;
      page.push(...rows.slice(index, index + size));
      index += size;
      continue;
    }
    let end = index + 1;
    while (rows[end]?.atomicGroupId === row.atomicGroupId) end += 1;
    const group = rows.slice(index, end);
    if (group.length !== 2 || group.some((item) => item.entityType !== "transaction")) {
      throw new HttpError(
        409,
        "full_resync_required",
        "An atomic synchronization boundary is invalid. Start a safe full resynchronization.",
        { reason: "invalid_atomic_group_boundary" },
      );
    }
    if (page.length > 0 && page.length + group.length > limit) break;
    page.push(...group);
    index = end;
  }
  return page;
}

export function mobileSyncServerTimestamp(): string {
  return new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}
