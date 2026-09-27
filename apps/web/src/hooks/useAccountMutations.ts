import type {
  AccountBalanceSummaryItem,
  AccountInput,
  AccountRecord,
  DashboardSummary,
  InterestFrequency,
} from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { createAccount, deleteAccount, updateAccount } from "../lib/api";
import {
  optimisticId,
  restoreOptimisticSnapshot,
  updateOptimistically,
  type OptimisticCacheSnapshot,
} from "../lib/optimistic";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";
import { invalidateAfterAccountWrite } from "../queries/accounts";

interface AccountOptimisticContext {
  accountSnapshot: OptimisticCacheSnapshot;
  dashboardSnapshot: OptimisticCacheSnapshot;
}

function dashboardAccountFromRecord(
  account: AccountRecord,
  current?: AccountBalanceSummaryItem,
): AccountBalanceSummaryItem {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    balanceMinor: current?.balanceMinor ?? account.balanceMinor ?? 0,
    balancesByCurrency: current?.balancesByCurrency ??
      account.balancesByCurrency ?? { PHP: 0, USD: 0 },
    archived: account.archived,
    system: account.system ?? false,
    interest: account.interest,
  };
}

/**
 * The dashboard's account create, edit, and remove mutations with their optimistic updates, plus
 * the form drafts those mutations close on submit and restore on failure. The page calls this
 * above its loading and error returns, so a failed dashboard refetch does not discard an open
 * draft.
 */
export function useAccountMutations(workspace: AuthenticatedWorkspace) {
  const queryClient = useQueryClient();
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountInput["type"]>("checking");
  const [editingAccount, setEditingAccount] = useState<AccountBalanceSummaryItem>();
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<AccountInput["type"]>("checking");
  const [interestEnabled, setInterestEnabled] = useState(false);
  const [interestRate, setInterestRate] = useState("");
  const [interestFrequency, setInterestFrequency] = useState<InterestFrequency>("monthly");
  const [interestPayDay, setInterestPayDay] = useState(15);
  const [removingAccount, setRemovingAccount] = useState<AccountBalanceSummaryItem>();

  const refreshAccountData = async () => {
    await invalidateAfterAccountWrite(queryClient, workspace);
  };
  const dashboardSummaryKey = queryKeys.allDashboardSummaries(workspace);

  const updateAccountOptimistically = async (
    updateAccounts: (current: AccountRecord[] | undefined) => AccountRecord[] | undefined,
    updateDashboard: (current: DashboardSummary | undefined) => DashboardSummary | undefined,
  ): Promise<AccountOptimisticContext> => {
    const accountSnapshot = await updateOptimistically<AccountRecord[]>(
      queryClient,
      queryKeys.accounts(workspace),
      updateAccounts,
    );
    const dashboardSnapshot = await updateOptimistically<DashboardSummary>(
      queryClient,
      dashboardSummaryKey,
      updateDashboard,
      false,
    );
    return { accountSnapshot, dashboardSnapshot };
  };

  const restoreAccountContext = (context?: AccountOptimisticContext) => {
    restoreOptimisticSnapshot(queryClient, context?.accountSnapshot);
    restoreOptimisticSnapshot(queryClient, context?.dashboardSnapshot);
  };

  const createAccountMutation = useMutation({
    mutationFn: (input: AccountInput) => createAccount(workspace, input),
    onMutate: async (input) => {
      const id = optimisticId("account");
      const account: AccountRecord = {
        ...input,
        id,
        currency: "PHP",
        balanceMinor: 0,
        balancesByCurrency: { PHP: 0, USD: 0 },
        archived: false,
        system: false,
      };
      const cache = await updateAccountOptimistically(
        (current) => (current ? [...current, account] : current),
        (current) =>
          current?.accountBalances
            ? {
                ...current,
                accountBalances: {
                  ...current.accountBalances,
                  items: [...current.accountBalances.items, dashboardAccountFromRecord(account)],
                },
              }
            : current,
      );
      setAccountName("");
      setIsAddingAccount(false);
      return { cache, id, input };
    },
    onError: (_error, _input, context) => {
      restoreAccountContext(context?.cache);
      setAccountName(context?.input.name ?? "");
      setAccountType(context?.input.type ?? "checking");
      setIsAddingAccount(true);
    },
    onSuccess: (saved, _input, context) => {
      queryClient.setQueryData<AccountRecord[]>(queryKeys.accounts(workspace), (current) =>
        current?.map((account) => (account.id === context.id ? saved : account)),
      );
      queryClient.setQueriesData<DashboardSummary>({ queryKey: dashboardSummaryKey }, (current) =>
        current?.accountBalances
          ? {
              ...current,
              accountBalances: {
                ...current.accountBalances,
                items: current.accountBalances.items.map((account) =>
                  account.id === context.id ? dashboardAccountFromRecord(saved, account) : account,
                ),
              },
            }
          : current,
      );
    },
    onSettled: () => {
      void refreshAccountData();
    },
  });
  const updateAccountMutation = useMutation({
    mutationFn: (args: {
      id: string;
      name: string;
      type: AccountInput["type"];
      interest?: {
        enabled: boolean;
        annualRateBasisPoints: number;
        frequency: InterestFrequency;
        payDay: number | null;
      };
    }) =>
      updateAccount(workspace, {
        id: args.id,
        input: {
          name: args.name,
          type: args.type,
          ...(args.interest !== undefined && { interest: args.interest }),
        },
      }),
    onMutate: async (args) => {
      const form = editingAccount;
      const cache = await updateAccountOptimistically(
        (current) =>
          current?.map((account) =>
            account.id === args.id
              ? {
                  ...account,
                  name: args.name,
                  type: args.type,
                  ...(args.interest && {
                    interest: {
                      enabled: args.interest.enabled,
                      annualRateBasisPoints: args.interest.enabled
                        ? args.interest.annualRateBasisPoints
                        : null,
                      frequency: args.interest.enabled ? args.interest.frequency : null,
                      payDay: args.interest.enabled ? args.interest.payDay : null,
                    },
                  }),
                }
              : account,
          ),
        (current) =>
          current?.accountBalances
            ? {
                ...current,
                accountBalances: {
                  ...current.accountBalances,
                  items: current.accountBalances.items.map((account) =>
                    account.id === args.id
                      ? {
                          ...account,
                          name: args.name,
                          type: args.type,
                          ...(args.interest && {
                            interest: {
                              enabled: args.interest.enabled,
                              annualRateBasisPoints: args.interest.enabled
                                ? args.interest.annualRateBasisPoints
                                : null,
                              frequency: args.interest.enabled ? args.interest.frequency : null,
                              payDay: args.interest.enabled ? args.interest.payDay : null,
                            },
                          }),
                        }
                      : account,
                  ),
                },
              }
            : current,
      );
      setEditingAccount(undefined);
      return { cache, form };
    },
    onError: (_error, _args, context) => {
      restoreAccountContext(context?.cache);
      setEditingAccount(context?.form);
    },
    onSettled: () => {
      void refreshAccountData();
    },
  });
  const removeAccountMutation = useMutation({
    mutationFn: (accountId: string) => deleteAccount(workspace, accountId),
    onMutate: async (accountId) => {
      const form = removingAccount;
      const cache = await updateAccountOptimistically(
        (current) => current?.filter((account) => account.id !== accountId),
        (current) =>
          current?.accountBalances
            ? {
                ...current,
                accountBalances: {
                  ...current.accountBalances,
                  items: current.accountBalances.items.filter(
                    (account) => account.id !== accountId,
                  ),
                },
              }
            : current,
      );
      return { cache, form };
    },
    onSuccess: () => {
      setRemovingAccount(undefined);
    },
    onError: (_error, _id, context) => {
      restoreAccountContext(context?.cache);
      setRemovingAccount(context?.form);
    },
    onSettled: () => {
      void refreshAccountData();
    },
  });

  return {
    isAddingAccount,
    setIsAddingAccount,
    accountName,
    setAccountName,
    accountType,
    setAccountType,
    editingAccount,
    setEditingAccount,
    editName,
    setEditName,
    editType,
    setEditType,
    interestEnabled,
    setInterestEnabled,
    interestRate,
    setInterestRate,
    interestFrequency,
    setInterestFrequency,
    interestPayDay,
    setInterestPayDay,
    removingAccount,
    setRemovingAccount,
    createAccountMutation,
    updateAccountMutation,
    removeAccountMutation,
  };
}

export type AccountMutations = ReturnType<typeof useAccountMutations>;
