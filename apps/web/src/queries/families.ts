import { useQuery, type QueryClient } from "@tanstack/react-query";

import { getFamily, getFamilyInvitations, getWorkspaces } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function useWorkspaces(personal: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.workspaces(personal),
    queryFn: () => getWorkspaces(personal),
  });
}

export function useFamilyInvitations(personal: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.familyInvitations(personal),
    queryFn: () => getFamilyInvitations(personal),
  });
}

export function useFamily(family: AuthenticatedWorkspace | undefined) {
  return useQuery({
    queryKey: family ? queryKeys.family(family) : queryKeys.withoutWorkspace("family"),
    queryFn: () => getFamily(family!),
    enabled: Boolean(family),
  });
}

/** Creating, joining, leaving, or closing a family changes which workspaces the person has. */
export function invalidateAfterMembershipChange(
  queryClient: QueryClient,
  personal: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(personal) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.familyInvitations(personal) }),
  ]);
}

/** Invitations, roles, removals, and transfers change only the family's own detail. */
export function invalidateAfterFamilyWrite(
  queryClient: QueryClient,
  family: AuthenticatedWorkspace,
) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.family(family) });
}
