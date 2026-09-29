import type { Currency, WorkspaceSettings } from "@zoption/shared";

import type { Bindings } from "../types";

export interface WorkspaceSettingsRepository {
  get(env: Bindings, tenantId: string): Promise<WorkspaceSettings>;
  update(env: Bindings, tenantId: string, input: WorkspaceSettings): Promise<WorkspaceSettings>;
}

/** PHP is what every amount meant before the setting existed, so a missing row reads as PHP. */
export async function loadWorkspaceCurrency(env: Bindings, tenantId: string): Promise<Currency> {
  const row = await env.DB.prepare("SELECT currency FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<{ currency: string }>();
  return row?.currency === "USD" ? "USD" : "PHP";
}

/** The one statement that writes the workspace currency; `guard` narrows it to extra conditions. */
export function workspaceCurrencyStatement(
  env: Bindings,
  tenantId: string,
  currency: Currency,
  guard = "",
): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE tenants SET currency = ?, updated_at = datetime('now') WHERE id = ?${guard}`,
  ).bind(currency, tenantId);
}

export const workspaceSettingsRepository: WorkspaceSettingsRepository = {
  async get(env, tenantId) {
    return { currency: await loadWorkspaceCurrency(env, tenantId) };
  },

  async update(env, tenantId, input) {
    await workspaceCurrencyStatement(env, tenantId, input.currency).run();
    return { currency: await loadWorkspaceCurrency(env, tenantId) };
  },
};
