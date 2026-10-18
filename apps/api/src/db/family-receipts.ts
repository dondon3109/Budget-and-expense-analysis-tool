import { FAMILY_RESTORE_DAYS } from "@zoption/shared";

import { imageExtensions, isAllowedImageType } from "../avatars";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import type { EntryAccess } from "./transactions";

const KEY_PREFIX = "receipts/";
const RESTORE_WINDOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${FAMILY_RESTORE_DAYS} days')`;

export interface ReceiptPhoto {
  body: ReadableStream;
  contentType: string;
}

/**
 * One photo per family transaction, stored in the private RECEIPTS bucket and served only
 * through the signed-in API. The row has no foreign key to the transaction, so a deleted entry
 * keeps its photo until `purgeExpired` runs after the restore window.
 */
export interface FamilyReceiptRepository {
  read(env: Bindings, tenantId: string, transactionId: string): Promise<ReceiptPhoto | null>;
  /** Stores the photo, replacing any earlier one. `access` is the edit rule for the entry. */
  attach(
    env: Bindings,
    tenantId: string,
    userId: string,
    transactionId: string,
    photo: { bytes: ArrayBuffer; contentType: string },
    access?: EntryAccess,
  ): Promise<void>;
  remove(
    env: Bindings,
    tenantId: string,
    transactionId: string,
    access?: EntryAccess,
  ): Promise<void>;
  /** Removes photos whose entry is gone and can no longer be restored. */
  purgeExpired(env: Bindings, limit: number): Promise<number>;
  /** Removes every photo object a family holds, before its rows are purged. */
  purgeTenantObjects(env: Bindings, tenantId: string): Promise<void>;
}

function bucketOf(env: Bindings): R2Bucket {
  if (!env.RECEIPTS) {
    throw new HttpError(503, "receipts_unavailable", "Receipt photo storage is not configured.");
  }
  return env.RECEIPTS;
}

async function assertCanChange(
  env: Bindings,
  tenantId: string,
  transactionId: string,
  access: EntryAccess | undefined,
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT created_by_user_id AS authorUserId FROM transactions WHERE tenant_id = ? AND id = ?",
  )
    .bind(tenantId, transactionId)
    .first<{ authorUserId: string | null }>();
  if (!row) throw new HttpError(404, "transaction_not_found", "Transaction not found.");
  if (access?.authorOnly && row.authorUserId !== access.authorOnly) {
    throw new HttpError(
      403,
      "family_entry_not_yours",
      "Only the person who added this entry, or the family owner, can change its receipt.",
    );
  }
}

async function objectKeyOf(env: Bindings, tenantId: string, transactionId: string) {
  const row = await env.DB.prepare(
    "SELECT object_key AS objectKey FROM family_receipts WHERE tenant_id = ? AND transaction_id = ?",
  )
    .bind(tenantId, transactionId)
    .first<{ objectKey: string }>();
  return row?.objectKey ?? null;
}

export const familyReceiptRepository: FamilyReceiptRepository = {
  async read(env, tenantId, transactionId) {
    // A deleted entry's photo is kept for a restore but is not shown.
    const row = await env.DB.prepare(
      `SELECT r.object_key AS objectKey, r.content_type AS contentType FROM family_receipts r
       JOIN transactions t ON t.tenant_id = r.tenant_id AND t.id = r.transaction_id
       WHERE r.tenant_id = ? AND r.transaction_id = ?`,
    )
      .bind(tenantId, transactionId)
      .first<{ objectKey: string; contentType: string }>();
    if (!row) return null;
    const object = await bucketOf(env).get(row.objectKey);
    return object ? { body: object.body, contentType: row.contentType } : null;
  },

  async attach(env, tenantId, userId, transactionId, photo, access) {
    if (!isAllowedImageType(photo.contentType)) throw new Error("Unsupported receipt type.");
    const bucket = bucketOf(env);
    await assertCanChange(env, tenantId, transactionId, access);
    const previous = await objectKeyOf(env, tenantId, transactionId);
    const objectKey = `${KEY_PREFIX}${tenantId}/${transactionId}/${crypto.randomUUID()}.${
      imageExtensions[photo.contentType]
    }`;
    await bucket.put(objectKey, photo.bytes, { httpMetadata: { contentType: photo.contentType } });
    await env.DB.prepare(
      `INSERT INTO family_receipts
         (tenant_id, transaction_id, object_key, content_type, size_bytes, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id, transaction_id) DO UPDATE SET
         object_key = excluded.object_key, content_type = excluded.content_type,
         size_bytes = excluded.size_bytes, uploaded_by_user_id = excluded.uploaded_by_user_id,
         created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(tenantId, transactionId, objectKey, photo.contentType, photo.bytes.byteLength, userId)
      .run();
    if (previous) await bucket.delete(previous);
  },

  async remove(env, tenantId, transactionId, access) {
    const bucket = bucketOf(env);
    await assertCanChange(env, tenantId, transactionId, access);
    const objectKey = await objectKeyOf(env, tenantId, transactionId);
    if (!objectKey) return;
    await env.DB.prepare("DELETE FROM family_receipts WHERE tenant_id = ? AND transaction_id = ?")
      .bind(tenantId, transactionId)
      .run();
    await bucket.delete(objectKey);
  },

  async purgeExpired(env, limit) {
    if (!env.RECEIPTS) return 0;
    const { results } = await env.DB.prepare(
      `SELECT r.tenant_id AS tenantId, r.transaction_id AS transactionId, r.object_key AS objectKey
       FROM family_receipts r
       WHERE NOT EXISTS (SELECT 1 FROM transactions t
                         WHERE t.tenant_id = r.tenant_id AND t.id = r.transaction_id)
         AND NOT EXISTS (SELECT 1 FROM family_transaction_events e
                         WHERE e.tenant_id = r.tenant_id AND e.transaction_id = r.transaction_id
                           AND e.action = 'deleted' AND e.created_at > ${RESTORE_WINDOW})
       LIMIT ?`,
    )
      .bind(limit)
      .all<{ tenantId: string; transactionId: string; objectKey: string }>();
    for (const row of results) {
      await env.RECEIPTS.delete(row.objectKey);
      await env.DB.prepare("DELETE FROM family_receipts WHERE tenant_id = ? AND transaction_id = ?")
        .bind(row.tenantId, row.transactionId)
        .run();
    }
    return results.length;
  },

  async purgeTenantObjects(env, tenantId) {
    // Without the binding there were never any objects to remove.
    if (!env.RECEIPTS) return;
    const prefix = `${KEY_PREFIX}${tenantId}/`;
    let cursor: string | undefined;
    for (;;) {
      const listed = await env.RECEIPTS.list({ prefix, cursor, limit: 100 });
      if (listed.objects.length > 0) {
        await env.RECEIPTS.delete(listed.objects.map((object) => object.key));
      }
      if (!listed.truncated) return;
      cursor = listed.cursor;
    }
  },
};
