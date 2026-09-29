import type { WorkspaceSettings } from "@zoption/shared";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getWorkspaceSettings, updateWorkspaceSettings } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";
import { rememberedWorkspaceCurrency, rememberWorkspaceCurrency } from "../lib/workspaceCurrency";

export function workspaceSettingsQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.workspaceSettings(workspace),
    queryFn: async () => {
      const settings = await getWorkspaceSettings(workspace);
      rememberWorkspaceCurrency(workspace.userId, settings.currency);
      return settings;
    },
    // A remembered value renders the page at once; dated at zero, it is refetched immediately.
    initialData: () => {
      const currency = rememberedWorkspaceCurrency(workspace.userId);
      return currency ? { currency } : undefined;
    },
    initialDataUpdatedAt: 0,
    // The private page waits on the first answer, so a failure falls back to PHP at once
    // (the transport already retried) instead of holding the page through backoff.
    retry: false,
  });
}

export function useWorkspaceSettings(workspace: AuthenticatedWorkspace) {
  return useQuery(workspaceSettingsQueryOptions(workspace));
}

export function useUpdateWorkspaceSettings(workspace: AuthenticatedWorkspace) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspaceSettings) => updateWorkspaceSettings(workspace, input),
    onSuccess: async (settings) => {
      rememberWorkspaceCurrency(workspace.userId, settings.currency);
      queryClient.setQueryData(queryKeys.workspaceSettings(workspace), settings);
      // Dashboard totals and balances are computed in the workspace currency on the server.
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspace) });
    },
  });
}
