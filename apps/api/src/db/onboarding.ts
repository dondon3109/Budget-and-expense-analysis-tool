import type { OnboardingCashInput, OnboardingState, WorkspaceSettings } from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { defaultAccountIdForTenant, defaultCategoryIdForTenant } from "./tenants";
import { loadWorkspaceCurrency, type WorkspaceSettingsRepository } from "./workspace-settings";

export interface OnboardingRepository {
  get(env: Bindings, tenantId: string): Promise<OnboardingState>;
  saveCurrency(env: Bindings, tenantId: string, input: WorkspaceSettings): Promise<OnboardingState>;
  saveCashBalance(
    env: Bindings,
    tenantId: string,
    input: OnboardingCashInput,
  ): Promise<OnboardingState>;
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

function rejectComplete(step: Step): void {
  if (step === "complete") {
    throw new HttpError(409, "onboarding_complete", "Onboarding is already complete.");
  }
}

/**
 * The currency is saved through `settings`, the same repository behind Account Settings, so the
 * two can never disagree on the storage or the rules. Onboarding only tracks which step is next.
 */
export function createOnboardingRepository(
  settings: WorkspaceSettingsRepository,
): OnboardingRepository {
  return {
    get: loadState,

    async saveCurrency(env, tenantId, input) {
      rejectComplete(await loadStep(env, tenantId));
      await settings.update(env, tenantId, input);
      await env.DB.prepare(
        `UPDATE tenants SET onboarding_step = 'cash', updated_at = datetime('now')
         WHERE id = ? AND onboarding_step IN ('currency', 'cash')`,
      )
        .bind(tenantId)
        .run();
      return loadState(env, tenantId);
    },

    async saveCashBalance(env, tenantId, input) {
      const step = await loadStep(env, tenantId);
      rejectComplete(step);
      if (step !== "cash") {
        throw new HttpError(409, "onboarding_step_out_of_order", "Choose your currency first.");
      }

      // Every write is guarded by the step still being 'cash', and the opening entry has a fixed id,
      // so a double submit or a retry changes nothing the second time.
      await env.DB.batch([
        // Cash, Bank, and GCash were created in PHP before the currency was chosen. Untouched, they
        // take the workspace currency exactly as a newly created account does.
        env.DB.prepare(
          `UPDATE accounts SET currency = (SELECT currency FROM tenants WHERE id = ?1)
           WHERE tenant_id = ?1 AND system_key IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM transactions WHERE account_id = accounts.id)
             AND EXISTS (SELECT 1 FROM tenants WHERE id = ?1 AND onboarding_step = 'cash')`,
        ).bind(tenantId),
        ...(input.amountMinor > 0
          ? [
              env.DB.prepare(
                `INSERT OR IGNORE INTO transactions (
                   id, tenant_id, account_id, category_id, date, description, amount_minor,
                   currency, kind, source_kind
                 )
                 SELECT ?, id, ?, ?, ?, 'Opening cash balance', ?, currency, 'income', 'manual'
                 FROM tenants WHERE id = ? AND onboarding_step = 'cash'`,
              ).bind(
                `${tenantId}:transaction:opening-balance`,
                defaultAccountIdForTenant(tenantId),
                defaultCategoryIdForTenant(tenantId, "uncategorized-income"),
                input.date,
                input.amountMinor,
                tenantId,
              ),
            ]
          : []),
        env.DB.prepare(
          `UPDATE tenants SET onboarding_step = 'complete', updated_at = datetime('now')
           WHERE id = ? AND onboarding_step = 'cash'`,
        ).bind(tenantId),
      ]);
      return loadState(env, tenantId);
    },
  };
}
