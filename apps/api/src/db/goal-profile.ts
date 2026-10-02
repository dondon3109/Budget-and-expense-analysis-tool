import { type GoalProfile, type GoalSelection } from "@zoption/shared";

import type { Bindings } from "../types";

export interface GoalProfileRepository {
  get(env: Bindings, tenantId: string): Promise<GoalProfile>;
  /** Records that the goal screen was shown, once per workspace. */
  markShown(env: Bindings, tenantId: string): Promise<void>;
  select(env: Bindings, tenantId: string, input: GoalSelection): Promise<GoalProfile>;
  /** Skipping never clears a goal that was already chosen. */
  skip(env: Bindings, tenantId: string): Promise<GoalProfile>;
}

interface GoalRow {
  goal: GoalProfile["goal"];
  otherText: string | null;
  selectedAt: string | null;
  skipped: number;
}

const SELECT_GOAL = `SELECT primary_goal AS goal, goal_other_text AS otherText,
  goal_selected_at AS selectedAt, goal_skipped AS skipped FROM tenants WHERE id = ?`;

async function loadProfile(env: Bindings, tenantId: string): Promise<GoalProfile> {
  const row = await env.DB.prepare(SELECT_GOAL).bind(tenantId).first<GoalRow>();
  return {
    goal: row?.goal ?? null,
    otherText: row?.otherText ?? null,
    selectedAt: row?.selectedAt ?? null,
    skipped: row?.skipped === 1,
  };
}

/**
 * Every statement is scoped by the tenant from the auth context. Each event row is inserted before
 * the update and guarded by the goal it was decided against, so a concurrent change cannot record
 * an event for a transition that did not happen.
 */
export const goalProfileRepository: GoalProfileRepository = {
  get: loadProfile,

  async markShown(env, tenantId) {
    await env.DB.prepare(
      `INSERT INTO goal_events (id, tenant_id, name)
         SELECT ?1, id, 'onboarding_goal_shown' FROM tenants
         WHERE id = ?2 AND NOT EXISTS (
           SELECT 1 FROM goal_events WHERE tenant_id = ?2 AND name = 'onboarding_goal_shown')`,
    )
      .bind(crypto.randomUUID(), tenantId)
      .run();
  },

  async select(env, tenantId, input) {
    const before = await loadProfile(env, tenantId);
    const eventName = before.goal === null ? "onboarding_goal_selected" : "goal_changed";
    const statements = [];
    if (before.goal !== input.goal) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO goal_events (id, tenant_id, name, goal, from_goal)
             SELECT ?, id, ?, ?, primary_goal FROM tenants
             WHERE id = ? AND primary_goal IS ?`,
        ).bind(crypto.randomUUID(), eventName, input.goal, tenantId, before.goal),
      );
    }
    statements.push(
      env.DB.prepare(
        `UPDATE tenants
           SET primary_goal = ?, goal_other_text = ?, goal_skipped = 0,
               goal_selected_at = COALESCE(goal_selected_at, datetime('now')),
               updated_at = datetime('now')
           WHERE id = ?`,
      ).bind(input.goal, input.otherText, tenantId),
    );
    await env.DB.batch(statements);
    return loadProfile(env, tenantId);
  },

  async skip(env, tenantId) {
    const before = await loadProfile(env, tenantId);
    if (before.goal !== null || before.skipped) return before;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO goal_events (id, tenant_id, name)
           SELECT ?, id, 'onboarding_goal_skipped' FROM tenants
           WHERE id = ? AND primary_goal IS NULL AND goal_skipped = 0`,
      ).bind(crypto.randomUUID(), tenantId),
      env.DB.prepare(
        `UPDATE tenants SET goal_skipped = 1, updated_at = datetime('now')
           WHERE id = ? AND primary_goal IS NULL`,
      ).bind(tenantId),
    ]);
    return loadProfile(env, tenantId);
  },
};
