import type { WorkspaceSettings } from "@zoption/shared";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getWorkspaceSettings, updateWorkspaceSettings } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";
import { setWorkspaceCurrency } from "../lib/workspaceCurrency";

export function workspaceSettingsQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.workspaceSettings(workspace),
    queryFn: async () => {
      const settings = await getWorkspaceSettings(workspace);
      setWorkspaceCurrency(settings.currency);
      return settings;
    },
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
      queryClient.setQueryData(queryKeys.workspaceSettings(workspace), settings);
      setWorkspaceCurrency(settings.currency);
      // Dashboard totals and balances are computed in the workspace currency on the server.
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspace) });
    },
  });
}
