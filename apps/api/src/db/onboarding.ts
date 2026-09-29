import {
  OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
  type OnboardingCashInput,
  type OnboardingCashResult,
  type OnboardingState,
  type WorkspaceSettings,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { defaultAccountIdForTenant, defaultCategoryIdForTenant } from "./tenants";
import { loadWorkspaceCurrency, workspaceCurrencyStatement } from "./workspace-settings";

export interface OnboardingRepository {
  get(env: Bindings, tenantId: string): Promise<OnboardingState>;
  saveCurrency(env: Bindings, tenantId: string, input: WorkspaceSettings): Promise<OnboardingState>;
  saveCashBalance(
    env: Bindings,
    tenantId: string,
    input: OnboardingCashInput,
  ): Promise<OnboardingCashResult>;
}

type Step = OnboardingState["step"];

async function loadStep(env: Bindings, tenantId: string): Promise<Step> {
  const row = await env.DB.prepare("SELECT onboarding_step AS step FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<{ step: Step }>();
  return row?.step ?? "currency";
}

async function loadState(env: Bindings, tenantId: string): Promise<OnboardingState> {
  const [step, currency] = await Promise.all([
    loadStep(env, tenantId),
    loadWorkspaceCurrency(env, tenantId),
  ]);
  return { step, currency };
}

/** The client sends its local day, which is within a day of UTC today in every time zone. */
function isNearToday(date: string): boolean {
  const days = Math.abs(Date.parse(`${date}T00:00:00Z`) - Date.now()) / 86_400_000;
  return days <= 2;
}

function rejectComplete(step: Step): void {
  if (step === "complete") {
    throw new HttpError(409, "onboarding_complete", "Onboarding is already complete.");
  }
}

/**
 * The currency is written by the statement Account Settings uses, so the two can never disagree on
 * the storage or the rules. Onboarding only tracks which step is next.
 */
export const onboardingRepository: OnboardingRepository = {
  get: loadState,

  async saveCurrency(env, tenantId, input) {
    rejectComplete(await loadStep(env, tenantId));
    // Guarded, so a cash step that completes in between leaves the currency alone.
    await env.DB.batch([
      workspaceCurrencyStatement(env, tenantId, input.currency, { onlyDuringOnboarding: true }),
      env.DB.prepare(
        `UPDATE tenants SET onboarding_step = 'cash', updated_at = datetime('now')
           WHERE id = ? AND onboarding_step IN ('currency', 'cash')`,
      ).bind(tenantId),
    ]);
    const state = await loadState(env, tenantId);
    rejectComplete(state.step);
    return state;
  },

  async saveCashBalance(env, tenantId, input) {
    const step = await loadStep(env, tenantId);
    rejectComplete(step);
    if (!isNearToday(input.date)) {
      throw new HttpError(400, "invalid_date", "Use today's date for your opening balance.");
    }
    if (step !== "cash") {
      throw new HttpError(409, "onboarding_step_out_of_order", "Choose your currency first.");
    }

    // Every write is guarded by the step still being 'cash', and the opening entry has a fixed id,
    // so a double submit or a retry changes nothing the second time. A workspace that already has
    // entries (synced from mobile) keeps its balances: no opening entry is booked on top of them.
    await env.DB.batch([
      // Cash, Bank, and GCash were created in PHP before the currency was chosen. Untouched, they
      // take the workspace currency exactly as a newly created account does.
      env.DB.prepare(
        `UPDATE accounts SET currency = (SELECT currency FROM tenants WHERE id = ?1)
           WHERE tenant_id = ?1 AND system_key IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM transactions WHERE account_id = accounts.id AND deleted_at IS NULL)
             AND EXISTS (SELECT 1 FROM tenants WHERE id = ?1 AND onboarding_step = 'cash')`,
      ).bind(tenantId),
      ...(input.amountMinor > 0
        ? [
            // A workspace the previous Worker created after migration 0069 has no such category.
            env.DB.prepare(
              `INSERT OR IGNORE INTO categories (
                   id, tenant_id, name, kind, color, icon_emoji, system_key, origin, required_plan,
                   archived
                 )
                 SELECT ?, id,
                        CASE WHEN EXISTS (
                          SELECT 1 FROM categories
                          WHERE tenant_id = tenants.id AND kind = 'income' AND name = 'Opening balance')
                        THEN 'Opening balance (Zoption)' ELSE 'Opening balance' END,
                        'income', '#6b7280', NULL, ?, 'system', 'free', 1
                 FROM tenants WHERE id = ? AND onboarding_step = 'cash'`,
            ).bind(
              defaultCategoryIdForTenant(tenantId, "opening-balance"),
              OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
              tenantId,
            ),
            env.DB.prepare(
              `INSERT OR IGNORE INTO transactions (
                   id, tenant_id, account_id, category_id, date, description, amount_minor,
                   currency, kind, source_kind
                 )
                 SELECT ?, id, ?,
                        (SELECT id FROM categories WHERE tenant_id = tenants.id AND system_key = ?),
                        ?, 'Opening cash balance', ?, currency, 'income', 'manual'
                 FROM tenants WHERE id = ? AND onboarding_step = 'cash'
                   AND NOT EXISTS (
                   SELECT 1 FROM transactions WHERE tenant_id = ? AND deleted_at IS NULL)`,
            ).bind(
              `${tenantId}:transaction:opening-balance`,
              defaultAccountIdForTenant(tenantId),
              OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
              input.date,
              input.amountMinor,
              tenantId,
              tenantId,
            ),
          ]
        : []),
      env.DB.prepare(
        `UPDATE tenants SET onboarding_step = 'complete', updated_at = datetime('now')
           WHERE id = ? AND onboarding_step = 'cash'`,
      ).bind(tenantId),
    ]);
    const booked = await env.DB.prepare("SELECT 1 AS found FROM transactions WHERE id = ?")
      .bind(`${tenantId}:transaction:opening-balance`)
      .first<{ found: number }>();
    return { ...(await loadState(env, tenantId)), openingBalanceBooked: booked !== null };
  },
};
