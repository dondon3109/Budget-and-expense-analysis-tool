import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ShareLinkCreateInput } from "@zoption/shared";

import { createShareLink, listShareLinks, revokeShareLink } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/** The owner's active public links, for the manage-and-revoke list in Settings. */
export function useShareLinks(workspace: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.shareLinks(workspace),
    queryFn: () => listShareLinks(workspace),
  });
}

function invalidateShareLinks(queryClient: QueryClient, workspace: AuthenticatedWorkspace) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.shareLinks(workspace) });
}

export function useCreateShareLink(workspace: AuthenticatedWorkspace) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ShareLinkCreateInput) => createShareLink(workspace, input),
    onSuccess: () => invalidateShareLinks(queryClient, workspace),
  });
}

export function useRevokeShareLink(workspace: AuthenticatedWorkspace) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeShareLink(workspace, id),
    onSuccess: () => invalidateShareLinks(queryClient, workspace),
  });
}
