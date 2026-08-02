import { CURRENT_ASSISTANT_CONSENT_VERSION } from "@zoption/shared";
import type {
  AssistantMessage,
  AssistantMessageInput,
  AssistantMessageListQuery,
  AssistantMessagePage,
  AssistantPreferences,
  AssistantResponseMetadata,
  AssistantThread,
  AssistantThreadListQuery,
  AssistantThreadPage,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

const DEFAULT_RETENTION_DAYS = 90;
const RUN_LEASE_SECONDS = 45;

interface ThreadRow {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "completed" | "failed";
  response_metadata_json: string | null;
  created_at: string;
}

interface PreferenceRow {
  consented_at: string | null;
  consent_version: number;
  assistant_name: string | null;
  user_preferred_name: string | null;
  response_detail: "concise" | "standard";
  coaching_style: "gentle" | "direct";
  retention_days: number;
}

interface HistoryRow {
  role: "user" | "assistant";
  content: string;
  response_metadata_json: string | null;
}

export interface AssistantHistoryMessage {
  role: "user" | "assistant";
  content: string;
  metadata?: AssistantResponseMetadata;
}

export interface AssistantCompletedTurn {
  thread: AssistantThread;
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
}

export interface AssistantTurnStart {
  thread: AssistantThread;
  userMessage: AssistantMessage;
  history: AssistantHistoryMessage[];
  runId: string;
  duplicate?: AssistantCompletedTurn;
}

export interface AssistantAuditToolCall {
  sequence: number;
  toolName: string;
  argumentsJson: string;
  resultJson?: string;
  errorCode?: string;
}

export interface AssistantRunAudit {
  promptVersion: string;
  compliancePolicyJson: string;
  resolvedPeriodJson?: string;
  requiredToolGroupsJson: string;
  providerCallCount: number;
  validationStatus: "not_required" | "passed" | "fallback";
  toolCalls: AssistantAuditToolCall[];
}

export interface AssistantCompletionMetadata {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  responseMetadata?: AssistantResponseMetadata;
  audit?: AssistantRunAudit;
}

export interface AssistantRepository {
  getPreferences(env: Bindings, tenantId: string): Promise<AssistantPreferences>;
  grantConsent(env: Bindings, tenantId: string): Promise<AssistantPreferences>;
  setAssistantIdentity(
    env: Bindings,
    tenantId: string,
    identity: { assistantName: string; userPreferredName: string },
  ): Promise<AssistantPreferences>;
  setResponsePreferences(
    env: Bindings,
    tenantId: string,
    preferences: {
      responseDetail: "concise" | "standard";
      coachingStyle: "gentle" | "direct";
    },
  ): Promise<AssistantPreferences>;
  listThreads(
    env: Bindings,
    tenantId: string,
    query: AssistantThreadListQuery,
  ): Promise<AssistantThreadPage>;
  listMessages(
    env: Bindings,
    tenantId: string,
    threadId: string,
    query: AssistantMessageListQuery,
  ): Promise<AssistantMessagePage>;
  createThread(env: Bindings, tenantId: string, firstMessage: string): Promise<AssistantThread>;
  beginTurn(
    env: Bindings,
    tenantId: string,
    threadId: string,
    input: AssistantMessageInput,
  ): Promise<AssistantTurnStart>;
  completeTurn(
    env: Bindings,
    tenantId: string,
    start: AssistantTurnStart,
    content: string,
    metadata: AssistantCompletionMetadata,
  ): Promise<AssistantCompletedTurn>;
  failTurn(env: Bindings, tenantId: string, start: AssistantTurnStart): Promise<void>;
  deleteThread(env: Bindings, tenantId: string, threadId: string): Promise<void>;
  deleteAllThreads(env: Bindings, tenantId: string): Promise<void>;
  cleanupExpired(env: Bindings, tenantId?: string): Promise<number>;
}

function threadFromRow(row: ThreadRow): AssistantThread {
  return {
    id: row.id,
    title: row.title,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

function parseResponseMetadata(value: string | null): AssistantResponseMetadata | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as AssistantResponseMetadata) : undefined;
  } catch {
    return undefined;
  }
}

function messageFromRow(row: MessageRow): AssistantMessage {
  const metadata = parseResponseMetadata(row.response_metadata_json);
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    status: row.status,
    ...(metadata ? { metadata } : {}),
    createdAt: row.created_at,
  };
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function titleFromMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77).trimEnd()}…`;
}

async function requireThread(
  env: Bindings,
  tenantId: string,
  threadId: string,
): Promise<AssistantThread> {
  const row = await env.DB.prepare(
    `SELECT id, title, last_message_at, created_at
     FROM assistant_threads
     WHERE id = ? AND tenant_id = ?`,
  )
    .bind(threadId, tenantId)
    .first<ThreadRow>();
  if (!row) {
    throw new HttpError(404, "assistant_thread_not_found", "The assistant chat was not found.");
  }
  return threadFromRow(row);
}

async function findDuplicateTurn(
  env: Bindings,
  tenantId: string,
  clientRequestId: string,
): Promise<AssistantCompletedTurn | "pending" | null> {
  const userRow = await env.DB.prepare(
    `SELECT id, thread_id, role, content, status, response_metadata_json, created_at
     FROM assistant_messages
     WHERE tenant_id = ? AND client_request_id = ?`,
  )
    .bind(tenantId, clientRequestId)
    .first<MessageRow>();
  if (!userRow) return null;
  if (userRow.status === "pending") return "pending";
  if (userRow.status === "failed") return null;

  const [thread, assistantRow] = await Promise.all([
    requireThread(env, tenantId, userRow.thread_id),
    env.DB.prepare(
      `SELECT id, thread_id, role, content, status, response_metadata_json, created_at
       FROM assistant_messages
       WHERE tenant_id = ? AND thread_id = ? AND reply_to_message_id = ?
         AND role = 'assistant' AND status = 'completed'
       LIMIT 1`,
    )
      .bind(tenantId, userRow.thread_id, userRow.id)
      .first<MessageRow>(),
  ]);
  if (!assistantRow) return "pending";
  return {
    thread,
    userMessage: messageFromRow(userRow),
    assistantMessage: messageFromRow(assistantRow),
  };
}

export const assistantRepository: AssistantRepository = {
  async getPreferences(env, tenantId) {
    const row = await env.DB.prepare(
      `SELECT consented_at, consent_version, assistant_name, user_preferred_name,
              response_detail, coaching_style, retention_days
       FROM assistant_preferences
       WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<PreferenceRow>();
    return {
      consentedAt: row?.consented_at ?? null,
      consentVersion: row?.consent_version ?? 0,
      retentionDays: row?.retention_days ?? DEFAULT_RETENTION_DAYS,
      assistantName: row?.assistant_name ?? null,
      userPreferredName: row?.user_preferred_name ?? null,
      responseDetail: row?.response_detail ?? "concise",
      coachingStyle: row?.coaching_style ?? "gentle",
    };
  },

  async grantConsent(env, tenantId) {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO assistant_preferences
       (tenant_id, consented_at, consent_version, retention_days, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET consented_at = excluded.consented_at,
         consent_version = excluded.consent_version, updated_at = excluded.updated_at`,
    )
      .bind(tenantId, now, CURRENT_ASSISTANT_CONSENT_VERSION, DEFAULT_RETENTION_DAYS, now)
      .run();
    return this.getPreferences(env, tenantId);
  },

  async setAssistantIdentity(env, tenantId, identity) {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE assistant_preferences
       SET assistant_name = ?, user_preferred_name = ?, updated_at = ?
       WHERE tenant_id = ? AND consented_at IS NOT NULL AND consent_version = ?`,
    )
      .bind(
        identity.assistantName,
        identity.userPreferredName,
        now,
        tenantId,
        CURRENT_ASSISTANT_CONSENT_VERSION,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new HttpError(
        409,
        "assistant_consent_required",
        "Review and accept the AI data-sharing notice before naming your assistant.",
      );
    }
    return this.getPreferences(env, tenantId);
  },

  async setResponsePreferences(env, tenantId, preferences) {
    const result = await env.DB.prepare(
      `UPDATE assistant_preferences
       SET response_detail = ?, coaching_style = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND consented_at IS NOT NULL AND consent_version = ?`,
    )
      .bind(
        preferences.responseDetail,
        preferences.coachingStyle,
        tenantId,
        CURRENT_ASSISTANT_CONSENT_VERSION,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new HttpError(
        409,
        "assistant_consent_required",
        "Review and accept the AI data-sharing notice before changing assistant preferences.",
      );
    }
    return this.getPreferences(env, tenantId);
  },

  async listThreads(env, tenantId, query) {
    await this.cleanupExpired(env, tenantId);
    const rows = await env.DB.prepare(
      `SELECT id, title, last_message_at, created_at
       FROM assistant_threads
       WHERE tenant_id = ? AND (? IS NULL OR last_message_at < ?)
       ORDER BY last_message_at DESC, id DESC
       LIMIT ?`,
    )
      .bind(tenantId, query.cursor ?? null, query.cursor ?? null, query.limit + 1)
      .all<ThreadRow>();
    const hasMore = rows.results.length > query.limit;
    const pageRows = rows.results.slice(0, query.limit);
    return {
      items: pageRows.map(threadFromRow),
      nextCursor: hasMore ? (pageRows.at(-1)?.last_message_at ?? null) : null,
    };
  },

  async listMessages(env, tenantId, threadId, query) {
    await requireThread(env, tenantId, threadId);
    const rows = await env.DB.prepare(
      `SELECT id, thread_id, role, content, status, response_metadata_json, created_at
       FROM assistant_messages
       WHERE tenant_id = ? AND thread_id = ? AND (? IS NULL OR created_at < ?)
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
      .bind(tenantId, threadId, query.cursor ?? null, query.cursor ?? null, query.limit + 1)
      .all<MessageRow>();
    const hasMore = rows.results.length > query.limit;
    const pageRows = rows.results.slice(0, query.limit);
    return {
      items: pageRows.map(messageFromRow).reverse(),
      nextCursor: hasMore ? (pageRows.at(-1)?.created_at ?? null) : null,
    };
  },

  async createThread(env, tenantId, firstMessage) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const preferences = await this.getPreferences(env, tenantId);
    const retentionExpiresAt = addDays(now, preferences.retentionDays);
    const title = titleFromMessage(firstMessage);
    await env.DB.prepare(
      `INSERT INTO assistant_threads
       (id, tenant_id, title, last_message_at, retention_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, tenantId, title, now, retentionExpiresAt, now, now)
      .run();
    return { id, title, lastMessageAt: now, createdAt: now };
  },

  async beginTurn(env, tenantId, threadId, input) {
    const duplicate = await findDuplicateTurn(env, tenantId, input.clientRequestId);
    if (duplicate === "pending") {
      throw new HttpError(
        409,
        "assistant_turn_in_progress",
        "This message is still being processed.",
      );
    }
    if (duplicate) {
      return {
        thread: duplicate.thread,
        userMessage: duplicate.userMessage,
        history: [],
        runId: "duplicate",
        duplicate,
      };
    }

    const thread = await requireThread(env, tenantId, threadId);
    const now = new Date().toISOString();
    const runId = crypto.randomUUID();
    const runExpiresAt = new Date(Date.now() + RUN_LEASE_SECONDS * 1_000).toISOString();
    const lease = await env.DB.prepare(
      `UPDATE assistant_threads
       SET active_run_id = ?, active_run_expires_at = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?
         AND (active_run_id IS NULL OR active_run_expires_at < ?)`,
    )
      .bind(runId, runExpiresAt, now, threadId, tenantId, now)
      .run();
    if (lease.meta.changes !== 1) {
      throw new HttpError(
        409,
        "assistant_turn_in_progress",
        "Wait for the current assistant response to finish.",
      );
    }

    const historyRows = await env.DB.prepare(
      `SELECT role, content, response_metadata_json
       FROM assistant_messages
       WHERE tenant_id = ? AND thread_id = ? AND status = 'completed'
       ORDER BY created_at DESC, id DESC
       LIMIT 12`,
    )
      .bind(tenantId, threadId)
      .all<HistoryRow>();

    const messageId = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO assistant_messages
         (id, tenant_id, thread_id, role, content, status, client_request_id, created_at)
         VALUES (?, ?, ?, 'user', ?, 'pending', ?, ?)`,
      )
        .bind(messageId, tenantId, threadId, input.message, input.clientRequestId, now)
        .run();
    } catch (error) {
      await env.DB.prepare(
        `UPDATE assistant_threads SET active_run_id = NULL, active_run_expires_at = NULL
         WHERE id = ? AND tenant_id = ? AND active_run_id = ?`,
      )
        .bind(threadId, tenantId, runId)
        .run();
      throw error;
    }

    return {
      thread,
      userMessage: {
        id: messageId,
        threadId,
        role: "user",
        content: input.message,
        status: "pending",
        createdAt: now,
      },
      history: historyRows.results.reverse().map((row) => {
        const metadata = parseResponseMetadata(row.response_metadata_json);
        return { role: row.role, content: row.content, ...(metadata ? { metadata } : {}) };
      }),
      runId,
    };
  },

  async completeTurn(env, tenantId, start, content, metadata) {
    const now = new Date().toISOString();
    const assistantMessageId = crypto.randomUUID();
    const preferences = await this.getPreferences(env, tenantId);
    const retentionExpiresAt = addDays(now, preferences.retentionDays);

    const statements = [
      env.DB.prepare(
        `UPDATE assistant_messages SET status = 'completed'
         WHERE id = ? AND tenant_id = ? AND thread_id = ? AND status = 'pending'`,
      ).bind(start.userMessage.id, tenantId, start.thread.id),
      env.DB.prepare(
        `INSERT INTO assistant_messages
         (id, tenant_id, thread_id, role, content, status, reply_to_message_id, model,
          prompt_tokens, completion_tokens, finish_reason, response_metadata_json, created_at)
         VALUES (?, ?, ?, 'assistant', ?, 'completed', ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        assistantMessageId,
        tenantId,
        start.thread.id,
        content,
        start.userMessage.id,
        metadata.model,
        metadata.promptTokens ?? null,
        metadata.completionTokens ?? null,
        metadata.finishReason ?? null,
        metadata.responseMetadata ? JSON.stringify(metadata.responseMetadata) : null,
        now,
      ),
    ];

    if (metadata.audit) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO assistant_runs
           (id, tenant_id, thread_id, user_message_id, assistant_message_id, prompt_version,
            compliance_policy_json, resolved_period_json, required_tool_groups_json,
            provider_call_count, validation_status, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
        ).bind(
          start.runId,
          tenantId,
          start.thread.id,
          start.userMessage.id,
          assistantMessageId,
          metadata.audit.promptVersion,
          metadata.audit.compliancePolicyJson,
          metadata.audit.resolvedPeriodJson ?? null,
          metadata.audit.requiredToolGroupsJson,
          metadata.audit.providerCallCount,
          metadata.audit.validationStatus,
          now,
          now,
        ),
      );
      for (const toolCall of metadata.audit.toolCalls) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO assistant_tool_calls
             (id, tenant_id, run_id, sequence, tool_name, arguments_json, result_json,
              error_code, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            tenantId,
            start.runId,
            toolCall.sequence,
            toolCall.toolName,
            toolCall.argumentsJson,
            toolCall.resultJson ?? null,
            toolCall.errorCode ?? null,
            now,
          ),
        );
      }
    }

    statements.push(
      env.DB.prepare(
        `UPDATE assistant_threads
         SET last_message_at = ?, retention_expires_at = ?, active_run_id = NULL,
           active_run_expires_at = NULL, updated_at = ?
         WHERE id = ? AND tenant_id = ? AND active_run_id = ?`,
      ).bind(now, retentionExpiresAt, now, start.thread.id, tenantId, start.runId),
    );
    await env.DB.batch(statements);

    const updatedThread = { ...start.thread, lastMessageAt: now };
    return {
      thread: updatedThread,
      userMessage: { ...start.userMessage, status: "completed" },
      assistantMessage: {
        id: assistantMessageId,
        threadId: start.thread.id,
        role: "assistant",
        content,
        status: "completed",
        ...(metadata.responseMetadata ? { metadata: metadata.responseMetadata } : {}),
        createdAt: now,
      },
    };
  },

  async failTurn(env, tenantId, start) {
    if (start.runId === "duplicate") return;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE assistant_messages SET status = 'failed'
         WHERE id = ? AND tenant_id = ? AND thread_id = ? AND status = 'pending'`,
      ).bind(start.userMessage.id, tenantId, start.thread.id),
      env.DB.prepare(
        `UPDATE assistant_threads SET active_run_id = NULL, active_run_expires_at = NULL,
           updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ? AND active_run_id = ?`,
      ).bind(start.thread.id, tenantId, start.runId),
    ]);
  },

  async deleteThread(env, tenantId, threadId) {
    const result = await env.DB.prepare(
      `DELETE FROM assistant_threads WHERE id = ? AND tenant_id = ?`,
    )
      .bind(threadId, tenantId)
      .run();
    if (result.meta.changes !== 1) {
      throw new HttpError(404, "assistant_thread_not_found", "The assistant chat was not found.");
    }
  },

  async deleteAllThreads(env, tenantId) {
    await env.DB.prepare(`DELETE FROM assistant_threads WHERE tenant_id = ?`).bind(tenantId).run();
  },

  async cleanupExpired(env, tenantId) {
    const now = new Date().toISOString();
    const rows = tenantId
      ? await env.DB.prepare(
          `SELECT id FROM assistant_threads
           WHERE tenant_id = ? AND retention_expires_at < ? LIMIT 100`,
        )
          .bind(tenantId, now)
          .all<{ id: string }>()
      : await env.DB.prepare(
          `SELECT id FROM assistant_threads WHERE retention_expires_at < ? LIMIT 100`,
        )
          .bind(now)
          .all<{ id: string }>();
    if (rows.results.length === 0) return 0;
    await env.DB.batch(
      rows.results.map((row) =>
        env.DB.prepare(`DELETE FROM assistant_threads WHERE id = ?`).bind(row.id),
      ),
    );
    return rows.results.length;
  },
};
