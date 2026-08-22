import {
  mobileSyncCategorySnapshotSchema,
  mobileSyncChangeSchema,
  type MobileSyncChange,
} from "@zoption/shared";

import { HttpError } from "../../errors";

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
  hasPro: boolean,
): MobileSyncChange {
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
    // Financial payload details must not escape through validation or global error logging.
    throw new Error("Stored mobile synchronization data failed validation.");
  }
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
    let end = index + 1;
    while (rows[end]?.atomicGroupId === row.atomicGroupId) end += 1;
    const group = rows.slice(index, end);
    const kinds = group.map((item) => item.entityType);
    const validTransfer = group.length === 2 && kinds.every((kind) => kind === "transaction");
    const validSubscription =
      group.length === 2 && kinds.includes("subscription") && kinds.includes("transaction");
    if (!validTransfer && !validSubscription) {
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
