import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getGoalProfile, markGoalShown, saveGoal, skipGoal } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function goalProfileQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.goalProfile(workspace),
    queryFn: () => getGoalProfile(workspace),
    staleTime: Infinity,
  });
}

/** The workspace's goal. `data.goal` is null for skippers and users who never chose one. */
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

export function useSaveGoal(workspace: AuthenticatedWorkspace) {
  return useGoalWrite(workspace, saveGoal);
}

export function useSkipGoal(workspace: AuthenticatedWorkspace) {
  return useGoalWrite<void>(workspace, (target) => skipGoal(target));
}

export function useMarkGoalShown(workspace: AuthenticatedWorkspace) {
  return useMutation({ mutationFn: () => markGoalShown(workspace) });
}
