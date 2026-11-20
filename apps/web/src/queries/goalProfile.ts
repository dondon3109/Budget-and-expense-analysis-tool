import type { MoneyPreferences } from "@zoption/shared";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getGoalProfile,
  getMoneyPreferences,
  markGoalShown,
  saveGoals,
  saveMoneyPreferences,
  skipGoal,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function goalProfileQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.goalProfile(workspace),
    queryFn: () => getGoalProfile(workspace),
    staleTime: Infinity,
  });
}

/** The workspace's goals. `data.goal` (the lead goal) is null for skippers and users who never chose. */
export function useGoalProfile(workspace: AuthenticatedWorkspace) {
  return useQuery(goalProfileQueryOptions(workspace));
}

function useGoalWrite<Input>(
  workspace: AuthenticatedWorkspace,
  save: (workspace: AuthenticatedWorkspace, input: Input) => ReturnType<typeof getGoalProfile>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => save(workspace, input),
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.goalProfile(workspace), profile),
  });
}

export function useSaveGoals(workspace: AuthenticatedWorkspace) {
  return useGoalWrite(workspace, saveGoals);
}

export function useSkipGoal(workspace: AuthenticatedWorkspace) {
  return useGoalWrite<void>(workspace, (target) => skipGoal(target));
}

export function useMarkGoalShown(workspace: AuthenticatedWorkspace) {
  return useMutation({ mutationFn: () => markGoalShown(workspace) });
}

/** The workspace's money preferences, which tailor dashboard suggestions and assistant prompts. */
export function useMoneyPreferences(workspace: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.moneyPreferences(workspace),
    queryFn: () => getMoneyPreferences(workspace),
    staleTime: Infinity,
  });
}

export function useSaveMoneyPreferences(workspace: AuthenticatedWorkspace) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MoneyPreferences) => saveMoneyPreferences(workspace, input),
    onSuccess: (preferences) =>
      queryClient.setQueryData(queryKeys.moneyPreferences(workspace), preferences),
  });
}
