import type { AssistantMessage } from "@zoption/shared";

import type { Bindings } from "../types";
import { messageFromRow, type MessageRow } from "./assistant";

/**
 * The transaction drafts an assistant reply carries in its response metadata. A reply holds
 * one or more, addressed by slot: slot 0 is `transactionDraft` and slot n is
 * `extraTransactionDrafts[n - 1]`. Saving moves a draft pending → saving → saved with
 * conditional updates, and the created row has a stable id (the reply's id for slot 0, the
 * draft's own `transactionId` otherwise), so two taps, two tabs, or a retry after a request
 * died mid-save all create one transaction.
 */
export interface AssistantTransactionDraftRepository {
  findMessage(env: Bindings, tenantId: string, messageId: string): Promise<AssistantMessage | null>;
  /** A later reply in the same thread corrected this draft, so it can no longer be saved. */
  isReplaced(
    env: Bindings,
    tenantId: string,
    message: AssistantMessage,
    slot: number,
  ): Promise<boolean>;
  /** Returns the claim's timestamp, which scopes markSaved and release to this claim. */
  claim(env: Bindings, tenantId: string, messageId: string, slot: number): Promise<string | null>;
  markSaved(
    env: Bindings,
    tenantId: string,
    messageId: string,
    slot: number,
    transactionId: string,
    claimedAt: string,
  ): Promise<AssistantMessage | null>;
  release(
    env: Bindings,
    tenantId: string,
    messageId: string,
    slot: number,
    claimedAt: string,
  ): Promise<void>;
  transactionExists(env: Bindings, tenantId: string, transactionId: string): Promise<boolean>;
}

/**
 * JSON path of a draft slot. The slot is a route-validated integer, never free text, so it is
 * safe to place in the SQL string.
 */
function draftPath(slot: number): string {
  if (!Number.isInteger(slot) || slot < 0) throw new Error("invalid_draft_slot");
  return slot === 0 ? "$.transactionDraft" : `$.extraTransactionDrafts[${slot - 1}]`;
}

const draftField = (slot: number, field: string) =>
  `json_extract(response_metadata_json, '${draftPath(slot)}.${field}')`;

/**
 * A later reply in the thread holds a draft, in any slot, that corrects the draft at `slot`
 * (the corrected slot defaults to the first). `target` names the message row being checked.
 */
function replacedByLaterDraft(target: string, slot: number): string {
  return `EXISTS (
    SELECT 1 FROM assistant_messages AS later
    WHERE later.tenant_id = ${target}.tenant_id
      AND later.thread_id = ${target}.thread_id
      AND (
        (json_extract(later.response_metadata_json, '$.transactionDraft.replacesMessageId') = ${target}.id
          AND COALESCE(json_extract(later.response_metadata_json, '$.transactionDraft.replacesSlot'), 0) = ${slot})
        OR EXISTS (
          SELECT 1 FROM json_each(later.response_metadata_json, '$.extraTransactionDrafts') AS extra
          WHERE json_extract(extra.value, '$.replacesMessageId') = ${target}.id
            AND COALESCE(json_extract(extra.value, '$.replacesSlot'), 0) = ${slot}
        )
      )
  )`;
}

/** A claim older than this belongs to a request that died mid-save, so it may be taken over. */
export const STALE_CLAIM_MS = 2 * 60_000;

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

  async isReplaced(env, tenantId, message, slot) {
    draftPath(slot);
    const row = await env.DB.prepare(
      `SELECT 1 AS found FROM assistant_messages AS target
       WHERE target.tenant_id = ? AND target.id = ? AND ${replacedByLaterDraft("target", slot)}`,
    )
      .bind(tenantId, message.id)
      .first<{ found: number }>();
    return Boolean(row);
  },

  async claim(env, tenantId, messageId, slot) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
    const path = draftPath(slot);
    const result = await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(
         response_metadata_json,
         '${path}.status', 'saving',
         '${path}.claimedAt', ?
       )
       WHERE tenant_id = ? AND id = ?
         AND (${draftField(slot, "status")} = 'pending'
           OR (${draftField(slot, "status")} = 'saving' AND ${draftField(slot, "claimedAt")} < ?))
         -- A correction stored after the caller's isReplaced check still blocks the claim.
         AND NOT ${replacedByLaterDraft("assistant_messages", slot)}`,
    )
      .bind(now.toISOString(), tenantId, messageId, staleBefore)
      .run();
    return result.meta.changes === 1 ? now.toISOString() : null;
  },

  async markSaved(env, tenantId, messageId, slot, transactionId, claimedAt) {
    const path = draftPath(slot);
    await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(
         response_metadata_json,
         '${path}.status', 'saved',
         '${path}.transactionId', ?
       )
       WHERE tenant_id = ? AND id = ? AND ${draftField(slot, "status")} = 'saving'
         AND ${draftField(slot, "claimedAt")} = ?`,
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

  async release(env, tenantId, messageId, slot, claimedAt) {
    const path = draftPath(slot);
    await env.DB.prepare(
      `UPDATE assistant_messages
       SET response_metadata_json = json_set(response_metadata_json, '${path}.status', 'pending')
       WHERE tenant_id = ? AND id = ? AND ${draftField(slot, "status")} = 'saving'
         AND ${draftField(slot, "claimedAt")} = ?`,
    )
      .bind(tenantId, messageId, claimedAt)
      .run();
  },
};
