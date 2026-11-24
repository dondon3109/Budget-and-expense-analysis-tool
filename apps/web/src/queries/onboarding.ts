import type { OnboardingState, QuickStartState } from "@zoption/shared";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  dismissQuickStart,
  getOnboardingState,
  getQuickStartState,
  saveOnboardingCashBalance,
  saveOnboardingCurrency,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";
import { rememberWorkspaceCurrency } from "../lib/workspaceCurrency";

export function onboardingQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.onboarding(workspace),
    queryFn: () => getOnboardingState(workspace),
    // Once complete it never reverts; before that the page owns every change to it.
    staleTime: Infinity,
    retry: 1,
  });
}

export function useOnboarding(workspace: AuthenticatedWorkspace) {
  return useQuery(onboardingQueryOptions(workspace));
}

/** Both steps return the new state, and the currency they save is the workspace currency. */
function useOnboardingWrite<Input, Result extends OnboardingState>(
  workspace: AuthenticatedWorkspace,
  save: (workspace: AuthenticatedWorkspace, input: Input) => Promise<Result>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => save(workspace, input),
    onSuccess: async (result) => {
      // The cache holds the state only, not what the cash step adds to it.
      const state: OnboardingState = { step: result.step, currency: result.currency };
      rememberWorkspaceCurrency(workspace.userId, state.currency);
      queryClient.setQueryData(queryKeys.workspaceSettings(workspace), {
        currency: state.currency,
      });
      queryClient.setQueryData(queryKeys.onboarding(workspace), state);
      if (state.step === "complete") {
        // Accounts and dashboard totals now include the opening balance.
        await queryClient.invalidateQueries({
          queryKey: queryKeys.workspace(workspace),
          predicate: (query) => query.queryKey[2] !== "onboarding",
        });
      }
    },
  });
}

export function useSaveOnboardingCurrency(workspace: AuthenticatedWorkspace) {
  return useOnboardingWrite(workspace, saveOnboardingCurrency);
}

export function useSaveOnboardingCashBalance(workspace: AuthenticatedWorkspace) {
  return useOnboardingWrite(workspace, saveOnboardingCashBalance);
}

export function quickStartQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.quickStart(workspace),
    queryFn: () => getQuickStartState(workspace),
    staleTime: Infinity,
    retry: false,
  });
}

export function useQuickStartState(workspace: AuthenticatedWorkspace, enabled = true) {
  return useQuery({ ...quickStartQueryOptions(workspace), enabled });
}

export function useDismissQuickStart(workspace: AuthenticatedWorkspace) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dismissQuickStart(workspace),
    onMutate: () => {
      queryClient.setQueryData<QuickStartState>(queryKeys.quickStart(workspace), {
        dismissed: true,
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.quickStart(workspace), result);
    },
  });
}
