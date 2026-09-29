import { currencies, currencyMetadata, type Currency } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from "../../queries/settings";

export function CurrencySettings({ workspace }: { workspace: AuthenticatedWorkspace }) {
  const settingsQuery = useWorkspaceSettings(workspace);
  const updateSettings = useUpdateWorkspaceSettings(workspace);
  const selected = updateSettings.isPending
    ? updateSettings.variables.currency
    : settingsQuery.data?.currency;

  return (
    <section
      id="workspace-currency"
      className="settings-section"
      aria-labelledby="workspace-currency-title"
      tabIndex={-1}
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="workspace-currency-title">Currency</h2>
          <p>
            Budgets, goals, debts, plans, and dashboard totals show in this currency, and new
            accounts start in it. Changing it relabels those amounts; stored amounts are not
            converted. Accounts keep their own currency. The remittance calculator sends from this
            currency.
          </p>
        </div>
        <span>Workspace</span>
      </div>

      {settingsQuery.isPending ? (
        <p className="settings-helper" role="status">
          Loading your currency…
        </p>
      ) : settingsQuery.isError ? (
        <p className="form-error" role="alert">
          Your currency could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <div className="settings-form">
          <label>
            <span>Workspace currency</span>
            <select
              value={selected}
              disabled={updateSettings.isPending}
              onChange={(event) =>
                updateSettings.mutate({ currency: event.target.value as Currency })
              }
            >
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currencyMetadata[currency].label}
                </option>
              ))}
            </select>
          </label>
          {updateSettings.isError && (
            <p className="form-error" role="alert">
              The currency could not be saved. Try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
