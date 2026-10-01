import type { AssistantMessage } from "@zoption/shared";

import type { Bindings } from "../types";
import { messageFromRow, type MessageRow } from "./assistant";

/**
 * The transaction draft an assistant reply carries in its response metadata. Saving moves
 * it pending → saving → saved with conditional updates, and the created row is keyed on the
 * reply's id, so two taps, two tabs, or a retry after a request died mid-save all create one
 * transaction.
 */
export interface AssistantTransactionDraftRepository {
  findMessage(env: Bindings, tenantId: string, messageId: string): Promise<AssistantMessage | null>;
  /** A later reply in the same thread corrected this draft, so it can no longer be saved. */
  isReplaced(env: Bindings, tenantId: string, message: AssistantMessage): Promise<boolean>;
  /** Returns the claim's timestamp, which scopes markSaved and release to this claim. */
  claim(env: Bindings, tenantId: string, messageId: string): Promise<string | null>;
  markSaved(
    env: Bindings,
    tenantId: string,
    messageId: string,
    transactionId: string,
    claimedAt: string,
  ): Promise<AssistantMessage | null>;
  release(env: Bindings, tenantId: string, messageId: string, claimedAt: string): Promise<void>;
  transactionExists(env: Bindings, tenantId: string, transactionId: string): Promise<boolean>;
}

const DRAFT_STATUS = "json_extract(response_metadata_json, '$.transactionDraft.status')";
const DRAFT_CLAIMED_AT = "json_extract(response_metadata_json, '$.transactionDraft.claimedAt')";
/** A claim older than this belongs to a request that died mid-save, so it may be taken over. */
const STALE_CLAIM_MS = 2 * 60_000;

export const assistantTransactionDraftRepository: AssistantTransactionDraftRepository = {
  async findMessage(env, tenantId, messageId) {
    const row = await env.DB.prepare(
      `SELECT id, thread_id, role, content, status, response_metadata_json, created_at
       FROM assistant_messages
       WHERE tenant_id = ? AND id = ? AND role = 'assistant' AND status = 'completed'`,
    )
      .bind(tenantId, messageId)
      .first<MessageRow>();
    return row ? messageFromRow(row) : null;
  },

  async isReplaced(env, tenantId, message) {
    const row = await env.DB.prepare(
      `SELECT 1 AS found FROM assistant_messages
       WHERE tenant_id = ? AND thread_id = ? AND role = 'assistant'
         AND json_extract(response_metadata_json, '$.transactionDraft.replacesMessageId') = ?
       LIMIT 1`,
    )
      .bind(tenantId, message.threadId, message.id)
      .first<{ found: number }>();
    return Boolean(row);
  },

  async claim(env, tenantId, messageId) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
    const result = await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(
         response_metadata_json,
         '$.transactionDraft.status', 'saving',
         '$.transactionDraft.claimedAt', ?
       )
       WHERE tenant_id = ? AND id = ?
         AND (${DRAFT_STATUS} = 'pending'
           OR (${DRAFT_STATUS} = 'saving' AND ${DRAFT_CLAIMED_AT} < ?))
         -- A correction stored after the caller's isReplaced check still blocks the claim.
         AND NOT EXISTS (
           SELECT 1 FROM assistant_messages AS later
           WHERE later.tenant_id = assistant_messages.tenant_id
             AND later.thread_id = assistant_messages.thread_id
             AND json_extract(later.response_metadata_json, '$.transactionDraft.replacesMessageId')
               = assistant_messages.id
         )`,
    )
      .bind(now.toISOString(), tenantId, messageId, staleBefore)
      .run();
    return result.meta.changes === 1 ? now.toISOString() : null;
  },

  async markSaved(env, tenantId, messageId, transactionId, claimedAt) {
    await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(
         response_metadata_json,
         '$.transactionDraft.status', 'saved',
         '$.transactionDraft.transactionId', ?
       )
       WHERE tenant_id = ? AND id = ? AND ${DRAFT_STATUS} = 'saving' AND ${DRAFT_CLAIMED_AT} = ?`,
    )
      .bind(transactionId, tenantId, messageId, claimedAt)
      .run();
    return this.findMessage(env, tenantId, messageId);
  },

  async transactionExists(env, tenantId, transactionId) {
    const row = await env.DB.prepare(
      `SELECT 1 AS found FROM transactions WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, transactionId)
      .first<{ found: number }>();
    return Boolean(row);
  },

  async release(env, tenantId, messageId, claimedAt) {
    await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(response_metadata_json, '$.transactionDraft.status', 'pending')
       WHERE tenant_id = ? AND id = ? AND ${DRAFT_STATUS} = 'saving' AND ${DRAFT_CLAIMED_AT} = ?`,
    )
      .bind(tenantId, messageId, claimedAt)
      .run();
  },
};
