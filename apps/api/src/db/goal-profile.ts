import {
  firstActionByGoal,
  OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
  type GoalFirstAction,
  type GoalProfile,
  type GoalSelection,
} from "@zoption/shared";

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
 * The earliest tenant data created since the goal was chosen that counts as each goal's first
 * action, or NULL. Binds: ?1 tenant, ?2 goal_selected_at, ?3 opening balance category key (log_transaction only). Its
 * timestamp becomes the event time, so reading the profile late never stretches the 24 hour
 * activation window.
 */
const FIRST_ACTION_ACTIVITY: Record<GoalFirstAction, string> = {
  log_transaction: `SELECT MIN(t.created_at) FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.tenant_id = ?1 AND t.deleted_at IS NULL AND t.created_at >= ?2
      AND c.system_key IS NOT ?3`,
  set_budget: `SELECT MIN(created_at) FROM budgets WHERE tenant_id = ?1 AND created_at >= ?2`,
  create_savings_goal: `SELECT MIN(created_at) FROM financial_goals WHERE tenant_id = ?1 AND created_at >= ?2`,
  add_debt: `SELECT MIN(created_at) FROM debts WHERE tenant_id = ?1 AND created_at >= ?2`,
  ask_assistant: `SELECT MIN(created_at) FROM assistant_messages
    WHERE tenant_id = ?1 AND role = 'user' AND created_at >= ?2`,
  import_data: `SELECT MIN(created_at) FROM imports WHERE tenant_id = ?1 AND created_at >= ?2`,
};

/**
 * Records first_action_completed once per workspace, derived from data that already exists so no
 * feature route has to report it. Only a workspace with a chosen goal can complete one.
 */
async function recordFirstAction(env: Bindings, tenantId: string, profile: GoalProfile) {
  if (profile.goal === null || profile.selectedAt === null) return;
  const action = firstActionByGoal[profile.goal];
  await env.DB.prepare(
    `INSERT INTO goal_events (id, tenant_id, name, goal, action, created_at)
       SELECT ?4, ?1, 'first_action_completed', ?5, ?6, activity.at
       FROM (SELECT (${FIRST_ACTION_ACTIVITY[action]}) AS at) AS activity
       WHERE activity.at IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM goal_events WHERE tenant_id = ?1 AND name = 'first_action_completed')`,
  )
    .bind(
      tenantId,
      profile.selectedAt,
      OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
      crypto.randomUUID(),
      profile.goal,
      action,
    )
    .run();
}

/**
 * Every statement is scoped by the tenant from the auth context. Each event row is inserted before
 * the update and guarded by the goal it was decided against, so a concurrent change cannot record
 * an event for a transition that did not happen.
 */
export const goalProfileRepository: GoalProfileRepository = {
  async get(env, tenantId) {
    const profile = await loadProfile(env, tenantId);
    await recordFirstAction(env, tenantId, profile);
    return profile;
  },

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
