import {
  mobileSyncPushResultSchema,
  type MobileSyncPushOperation,
  type MobileSyncPushResult,
} from "@zoption/shared";

import { HttpError } from "../../../errors";
import type { Bindings } from "../../../types";

export interface IdempotencyRow {
  requestHash: string;
  responseJson: string;
}

export async function requestHash(operation: MobileSyncPushOperation): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(operation));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readIdempotency(
  env: Bindings,
  tenantId: string,
  clientId: string,
  idempotencyKey: string,
): Promise<IdempotencyRow | null> {
  return env.DB.prepare(
    `SELECT request_hash AS requestHash, response_json AS responseJson
     FROM mobile_sync_idempotency
     WHERE tenant_id = ? AND client_id = ? AND idempotency_key = ?`,
  )
    .bind(tenantId, clientId, idempotencyKey)
    .first<IdempotencyRow>();
}

export function decodeStoredResult(row: IdempotencyRow): MobileSyncPushResult {
  try {
    return mobileSyncPushResultSchema.parse(JSON.parse(row.responseJson) as unknown);
  } catch {
    throw new Error("Stored mobile idempotency data failed validation.");
  }
}

export function idempotencyInsert(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: MobileSyncPushOperation,
  hash: string,
  result: MobileSyncPushResult,
  requirePreviousChange: boolean,
) {
  return env.DB.prepare(
    `INSERT INTO mobile_sync_idempotency (
      tenant_id, client_id, idempotency_key, request_hash, response_json
    ) SELECT ?, ?, ?, ?, ? ${requirePreviousChange ? "WHERE changes() = 1" : ""}`,
  ).bind(tenantId, clientId, operation.idempotencyKey, hash, JSON.stringify(result));
}

export function requiredIdempotencyInsert(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: MobileSyncPushOperation,
  hash: string,
  result: MobileSyncPushResult,
  expectedPreviousChanges = 1,
) {
  return env.DB.prepare(
    `INSERT INTO mobile_sync_idempotency (
      tenant_id, client_id, idempotency_key, request_hash, response_json
    ) VALUES (?, ?, ?, CASE WHEN changes() = ? THEN ? ELSE NULL END, ?)`,
  ).bind(
    tenantId,
    clientId,
    operation.idempotencyKey,
    expectedPreviousChanges,
    hash,
    JSON.stringify(result),
  );
}

export function idempotencyKeyReused(): HttpError {
  return new HttpError(
    409,
    "idempotency_key_reused",
    "This synchronization key was already used for another operation.",
  );
}

/** The stored result for a replayed key; a key reused for a different operation is a 409. */
export function replayedResult(row: IdempotencyRow, hash: string): MobileSyncPushResult {
  if (row.requestHash !== hash) throw idempotencyKeyReused();
  return decodeStoredResult(row);
}

export async function persistResult(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: MobileSyncPushOperation,
  hash: string,
  result: MobileSyncPushResult,
): Promise<MobileSyncPushResult> {
  try {
    await idempotencyInsert(env, tenantId, clientId, operation, hash, result, false).run();
    return result;
  } catch {
    const replay = await readIdempotency(env, tenantId, clientId, operation.idempotencyKey);
    if (!replay) throw idempotencyKeyReused();
    return replayedResult(replay, hash);
  }
}
