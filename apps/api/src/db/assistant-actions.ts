import type { AssistantMessage } from "@zoption/shared";

import type { Bindings } from "../types";
import { assistantTransactionDraftRepository } from "./assistant-transaction-drafts";

/**
 * The subscription, goal, or debt change an assistant reply proposed, kept in its response
 * metadata. Applying it moves pending → saving → done with conditional updates, so two taps
 * or two tabs apply it once. Unlike a transaction draft there is no id to key the write on,
 * so a claim is never taken over: a request that died mid-apply leaves `saving` behind and the
 * user checks the list rather than risking a second record.
 */
export interface AssistantActionRepository {
  findMessage(env: Bindings, tenantId: string, messageId: string): Promise<AssistantMessage | null>;
  /** A later reply in the thread proposed again, so this one can no longer be applied. */
  isSuperseded(env: Bindings, tenantId: string, message: AssistantMessage): Promise<boolean>;
  /** Returns the claim's timestamp, which scopes markDone and release to this claim. */
  claim(env: Bindings, tenantId: string, messageId: string): Promise<string | null>;
  markDone(
    env: Bindings,
    tenantId: string,
    messageId: string,
    claimedAt: string,
  ): Promise<AssistantMessage | null>;
  release(env: Bindings, tenantId: string, messageId: string, claimedAt: string): Promise<void>;
}

const STATUS = "json_extract(response_metadata_json, '$.assistantAction.status')";
const CLAIMED_AT = "json_extract(response_metadata_json, '$.assistantAction.claimedAt')";
const LATER_ACTION = `EXISTS (
  SELECT 1 FROM assistant_messages AS later
  WHERE later.tenant_id = assistant_messages.tenant_id
    AND later.thread_id = assistant_messages.thread_id
    AND later.role = 'assistant'
    AND later.created_at > assistant_messages.created_at
    AND json_extract(later.response_metadata_json, '$.assistantAction') IS NOT NULL
)`;

export const assistantActionRepository: AssistantActionRepository = {
  findMessage: (env, tenantId, messageId) =>
    assistantTransactionDraftRepository.findMessage(env, tenantId, messageId),

  async isSuperseded(env, tenantId, message) {
    const row = await env.DB.prepare(
      `SELECT 1 AS found FROM assistant_messages
       WHERE tenant_id = ? AND id = ? AND ${LATER_ACTION}`,
    )
      .bind(tenantId, message.id)
      .first<{ found: number }>();
    return Boolean(row);
  },

  async claim(env, tenantId, messageId) {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(
         response_metadata_json,
         '$.assistantAction.status', 'saving',
         '$.assistantAction.claimedAt', ?
       )
       WHERE tenant_id = ? AND id = ? AND ${STATUS} = 'pending' AND NOT ${LATER_ACTION}`,
    )
      .bind(now, tenantId, messageId)
      .run();
    return result.meta.changes === 1 ? now : null;
  },

  async markDone(env, tenantId, messageId, claimedAt) {
    await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(response_metadata_json, '$.assistantAction.status', 'done')
       WHERE tenant_id = ? AND id = ? AND ${STATUS} = 'saving' AND ${CLAIMED_AT} = ?`,
    )
      .bind(tenantId, messageId, claimedAt)
      .run();
    return this.findMessage(env, tenantId, messageId);
  },

  async release(env, tenantId, messageId, claimedAt) {
    await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(response_metadata_json, '$.assistantAction.status', 'pending')
       WHERE tenant_id = ? AND id = ? AND ${STATUS} = 'saving' AND ${CLAIMED_AT} = ?`,
    )
      .bind(tenantId, messageId, claimedAt)
      .run();
  },
};
