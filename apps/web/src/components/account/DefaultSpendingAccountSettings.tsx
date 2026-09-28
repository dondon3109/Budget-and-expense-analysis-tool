import { preferredTransactionAccount } from "@zoption/shared";

import {
  setDefaultSpendingAccountId,
  useDefaultSpendingAccountId,
} from "../../lib/defaultSpendingAccount";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useAccounts } from "../../queries/accounts";

export function DefaultSpendingAccountSettings({
  workspace,
}: {
  workspace: AuthenticatedWorkspace;
}) {
  const accountsQuery = useAccounts(workspace);
  const defaultSpendingAccountId = useDefaultSpendingAccountId();
  const activeAccounts = (accountsQuery.data ?? []).filter((account) => !account.archived);
  const selected = preferredTransactionAccount(activeAccounts, defaultSpendingAccountId);

  return (
    <section
      id="default-spending-account"
      className="settings-section"
      aria-labelledby="default-spending-account-title"
      tabIndex={-1}
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="default-spending-account-title">Default spending account</h2>
          <p>
            New transactions start on this account. Without a choice, Cash is picked first. This
            browser remembers the choice; another browser or device keeps its own.
          </p>
        </div>
        <span>Transactions</span>
      </div>

      {accountsQuery.isPending ? (
        <p className="settings-helper" role="status">
          Loading your accounts…
        </p>
      ) : accountsQuery.isError ? (
        <p className="form-error" role="alert">
          Your accounts could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <div className="settings-form">
          <label>
            <span>Account</span>
            <select
              value={selected?.id ?? ""}
              onChange={(event) => setDefaultSpendingAccountId(event.target.value)}
              disabled={activeAccounts.length === 0}
            >
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
