import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Landmark } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import { AccountBalanceForm } from "../components/accounts/AccountBalanceForm";
import { AppShell } from "../components/layout/AppShell";
import { getAccounts, setAccountBalance } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";

export function AccountsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: queryKeys.accounts(workspace),
    queryFn: () => getAccounts(workspace),
  });
  const balanceMutation = useMutation({
    mutationFn: (args: Parameters<typeof setAccountBalance>[1]) =>
      setAccountBalance(workspace, args),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.accounts(workspace), (current: typeof accounts.data) =>
        current?.map((account) => (account.id === updated.id ? updated : account)),
      );
    },
  });

  return (
    <AppShell>
      <div className="accounts-page">
        <header className="dashboard-header">
          <div className="dashboard-heading">
            <p className="eyebrow">Account snapshots</p>
            <h1>Give every balance a clear date</h1>
            <p>
              Record the current balance for each account so Zoption can answer balance questions
              without guessing.
            </p>
          </div>
          <span className="date-button">
            <Landmark size={17} aria-hidden="true" /> Manual balances
          </span>
        </header>

        <section className="balance-explanation" aria-label="How account balances work">
          <Info size={18} aria-hidden="true" />
          <p>
            These are manual snapshots. Adding, editing, or importing transactions does not update
            them automatically. Refresh a snapshot whenever the real account balance changes.
          </p>
        </section>

        {accounts.isLoading && <div className="full-page-status">Loading your accounts…</div>}
        {accounts.isError && (
          <div className="full-page-status error-state">
            <strong>Your accounts could not be loaded.</strong>
            <span>{accounts.error.message}</span>
            <button
              className="button primary"
              type="button"
              onClick={() => void accounts.refetch()}
            >
              Try again
            </button>
          </div>
        )}
        {accounts.data && (
          <div className="account-balance-grid">
            {accounts.data
              .filter((account) => !account.archived)
              .map((account) => (
                <AccountBalanceForm
                  key={account.id}
                  account={account}
                  saving={balanceMutation.isPending && balanceMutation.variables?.id === account.id}
                  onSave={(input) =>
                    balanceMutation.mutateAsync({ id: account.id, input }).then(() => undefined)
                  }
                />
              ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
