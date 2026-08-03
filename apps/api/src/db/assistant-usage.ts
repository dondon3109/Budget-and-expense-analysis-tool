import type { BillingUsage } from "@zoption/shared";

import {
  EFFECTIVE_PRO_ENTITLEMENT_CONDITION,
  FREE_LIMITS,
  PRO_LIMITS,
  usageLimit,
} from "../billing/usage-limits";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export const ASSISTANT_CYCLE_SECONDS = 14 * 24 * 60 * 60;

export const ASSISTANT_CYCLE_CONSUME_SQL = `INSERT INTO billing_assistant_cycle_usage
  (tenant_id, anchor_at_epoch, period_index, count, allowance)
VALUES (
  ?, unixepoch('now'), 0, 1,
  CASE WHEN ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION} THEN ? ELSE ? END
)
ON CONFLICT(tenant_id) DO UPDATE SET
  period_index = MAX(
    0,
    CAST(
      (unixepoch('now') - billing_assistant_cycle_usage.anchor_at_epoch) / ${ASSISTANT_CYCLE_SECONDS}
      AS INTEGER
    )
  ),
  count = CASE
    WHEN MAX(
      0,
      CAST(
        (unixepoch('now') - billing_assistant_cycle_usage.anchor_at_epoch) / ${ASSISTANT_CYCLE_SECONDS}
        AS INTEGER
      )
    ) > billing_assistant_cycle_usage.period_index
    THEN 1
    ELSE billing_assistant_cycle_usage.count + 1
  END,
  allowance = CASE WHEN ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION} THEN ? ELSE ? END,
  updated_at = datetime('now')`;

interface AssistantCycleUsageRow {
  anchorAtEpoch: number;
  periodIndex: number;
  count: number;
  nowEpoch: number;
}

export interface AssistantUsageRepository {
  getUsage(
    env: Bindings,
    tenantId: string,
    limit: number,
    now?: Date,
  ): Promise<BillingUsage>;
  consumeUsage(env: Bindings, tenantId: string): Promise<void>;
}

export function assistantCycleIndex(anchorAtEpoch: number, nowEpoch: number): number {
  return Math.max(0, Math.floor((nowEpoch - anchorAtEpoch) / ASSISTANT_CYCLE_SECONDS));
}

export function assistantCyclePeriod(
  anchorAtEpoch: number,
  periodIndex: number,
): { periodStartedAt: string; resetsAt: string } {
  const periodStartedAtEpoch = anchorAtEpoch + periodIndex * ASSISTANT_CYCLE_SECONDS;
  return {
    periodStartedAt: new Date(periodStartedAtEpoch * 1_000).toISOString(),
    resetsAt: new Date((periodStartedAtEpoch + ASSISTANT_CYCLE_SECONDS) * 1_000).toISOString(),
  };
}

export function isAssistantCycleLimitDatabaseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("billing_assistant_cycle_limit_reached")
  );
}

async function hasProEntitlement(env: Bindings, tenantId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 AS found FROM effective_pro_entitlements WHERE tenant_id = ? LIMIT 1",
  )
    .bind(tenantId)
    .first<{ found: number }>();
  return Boolean(row);
}

export async function getAssistantCycleUsage(
  env: Bindings,
  tenantId: string,
  limit: number,
  now?: Date,
): Promise<BillingUsage> {
  const existing = await env.DB.prepare(
    `SELECT anchor_at_epoch AS anchorAtEpoch, period_index AS periodIndex, count,
            unixepoch('now') AS nowEpoch
     FROM billing_assistant_cycle_usage
     WHERE tenant_id = ?`,
  )
    .bind(tenantId)
    .first<AssistantCycleUsageRow>();

  if (!existing) {
    return {
      feature: "assistant_question",
      used: 0,
      limit,
      periodKind: "anchored_14_day",
      periodStartedAt: null,
      resetsAt: null,
    };
  }

  const nowEpoch = now
    ? Math.floor(now.getTime() / 1_000)
    : Number(existing.nowEpoch);
  const currentIndex = Math.max(
    Number(existing.periodIndex),
    assistantCycleIndex(Number(existing.anchorAtEpoch), nowEpoch),
  );
  let count = Number(existing.count);
  if (currentIndex > Number(existing.periodIndex)) {
    await env.DB.prepare(
      `UPDATE billing_assistant_cycle_usage
       SET period_index = ?, count = 0, allowance = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND period_index < ?`,
    )
      .bind(currentIndex, limit, tenantId, currentIndex)
      .run();
    const current = await env.DB.prepare(
      `SELECT count FROM billing_assistant_cycle_usage
       WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ count: number }>();
    count = Number(current?.count ?? 0);
  }

  return {
    feature: "assistant_question",
    used: count,
    limit,
    periodKind: "anchored_14_day",
    ...assistantCyclePeriod(Number(existing.anchorAtEpoch), currentIndex),
  };
}

async function assistantCycleLimitError(env: Bindings, tenantId: string): Promise<HttpError> {
  const limit = usageLimit("assistant_question", await hasProEntitlement(env, tenantId));
  const item = await getAssistantCycleUsage(env, tenantId, limit);
  return new HttpError(
    409,
    "assistant_cycle_limit_reached",
    "You have reached your AI question limit for this 14-day period.",
    {
      feature: item.feature,
      used: item.used,
      limit: item.limit,
      periodKind: item.periodKind,
      periodStartedAt: item.periodStartedAt,
      resetsAt: item.resetsAt,
      billingPath: "/app/settings#plan-and-billing",
    },
  );
}

export const assistantUsageRepository: AssistantUsageRepository = {
  getUsage: getAssistantCycleUsage,

  async consumeUsage(env, tenantId) {
    try {
      await env.DB.prepare(ASSISTANT_CYCLE_CONSUME_SQL)
        .bind(
          tenantId,
          tenantId,
          PRO_LIMITS.assistant_question,
          FREE_LIMITS.assistant_question,
          tenantId,
          PRO_LIMITS.assistant_question,
          FREE_LIMITS.assistant_question,
        )
        .run();
    } catch (error) {
      if (isAssistantCycleLimitDatabaseError(error)) {
        throw await assistantCycleLimitError(env, tenantId);
      }
      throw error;
    }
  },
};
