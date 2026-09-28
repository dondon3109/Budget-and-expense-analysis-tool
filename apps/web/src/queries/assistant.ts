import { queryOptions, useQuery } from "@tanstack/react-query";

import { getAssistantPreferences } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function assistantPreferencesQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.assistantPreferences(workspace),
    queryFn: () => getAssistantPreferences(workspace),
  });
}

export function useAssistantPreferences(workspace: AuthenticatedWorkspace) {
  return useQuery(assistantPreferencesQueryOptions(workspace));
}
