import type { AssistantMessage } from "@zoption/shared";

import type { Bindings } from "../types";
import { messageFromRow, type MessageRow } from "./assistant";

/**
 * The transaction draft an assistant reply carries in its response metadata. Saving moves
 * it pending → saving → saved with conditional updates, so two taps on Save (or two tabs)
 * create one transaction.
 */
export interface AssistantTransactionDraftRepository {
  findMessage(env: Bindings, tenantId: string, messageId: string): Promise<AssistantMessage | null>;
  claim(env: Bindings, tenantId: string, messageId: string): Promise<boolean>;
  markSaved(
    env: Bindings,
    tenantId: string,
    messageId: string,
    transactionId: string,
  ): Promise<AssistantMessage | null>;
  release(env: Bindings, tenantId: string, messageId: string): Promise<void>;
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
           OR (${DRAFT_STATUS} = 'saving' AND ${DRAFT_CLAIMED_AT} < ?))`,
    )
      .bind(now.toISOString(), tenantId, messageId, staleBefore)
      .run();
    return result.meta.changes === 1;
  },

  async markSaved(env, tenantId, messageId, transactionId) {
    await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(
         response_metadata_json,
         '$.transactionDraft.status', 'saved',
         '$.transactionDraft.transactionId', ?
       )
       WHERE tenant_id = ? AND id = ? AND ${DRAFT_STATUS} = 'saving'`,
    )
      .bind(transactionId, tenantId, messageId)
      .run();
    return this.findMessage(env, tenantId, messageId);
  },

  async release(env, tenantId, messageId) {
    await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(response_metadata_json, '$.transactionDraft.status', 'pending')
       WHERE tenant_id = ? AND id = ? AND ${DRAFT_STATUS} = 'saving'`,
    )
      .bind(tenantId, messageId)
      .run();
  },
};
