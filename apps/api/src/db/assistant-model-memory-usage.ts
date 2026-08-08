import type { Bindings } from "../types";

export const MODEL_MEMORY_PASS_CYCLE_SECONDS = 14 * 24 * 60 * 60;
export const MODEL_MEMORY_PASS_CYCLE_CAP = 8;

const CURRENT_PERIOD_INDEX_SQL = `MAX(
  assistant_model_memory_pass_usage.period_index,
  MAX(
    0,
    CAST(
      (unixepoch('now') - assistant_model_memory_pass_usage.anchor_at_epoch) /
        ${MODEL_MEMORY_PASS_CYCLE_SECONDS} AS INTEGER
    )
  )
)`;

export const MODEL_MEMORY_PASS_CONSUME_SQL = `INSERT INTO assistant_model_memory_pass_usage
  (tenant_id, anchor_at_epoch, period_index, count)
VALUES (?, unixepoch('now'), 0, 1)
ON CONFLICT(tenant_id) DO UPDATE SET
  period_index = ${CURRENT_PERIOD_INDEX_SQL},
  count = CASE
    WHEN ${CURRENT_PERIOD_INDEX_SQL} > assistant_model_memory_pass_usage.period_index THEN 1
    ELSE assistant_model_memory_pass_usage.count + 1
  END,
  updated_at = datetime('now')
WHERE ${CURRENT_PERIOD_INDEX_SQL} > assistant_model_memory_pass_usage.period_index
   OR assistant_model_memory_pass_usage.count < ${MODEL_MEMORY_PASS_CYCLE_CAP}
RETURNING period_index AS periodIndex, count`;

interface ModelMemoryPassUsageRow {
  periodIndex: number;
  count: number;
}

export interface AssistantModelMemoryUsageRepository {
  tryConsumePass(env: Bindings, tenantId: string): Promise<boolean>;
}

export const assistantModelMemoryUsageRepository: AssistantModelMemoryUsageRepository = {
  async tryConsumePass(env, tenantId) {
    const consumed = await env.DB.prepare(MODEL_MEMORY_PASS_CONSUME_SQL)
      .bind(tenantId)
      .first<ModelMemoryPassUsageRow>();
    return consumed !== null;
  },
};
