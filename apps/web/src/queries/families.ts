import { useQuery, type QueryClient } from "@tanstack/react-query";

import {
  getFamily,
  getFamilyInvitations,
  getFamilySharedBalances,
  getMyBalanceShares,
  getWorkspaces,
} from "../lib/api";
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

export function useFamilySharedBalances(family: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.familySharedBalances(family),
    queryFn: () => getFamilySharedBalances(family),
  });
}

export function useMyBalanceShares(personal: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.myBalanceShares(personal),
    queryFn: () => getMyBalanceShares(personal),
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

/**
 * A share writes into the family and changes what the person sees on their own rows, so both
 * workspaces refresh: the family's ledger and balances, and the person's "Shared to" marks.
 */
export function invalidateAfterShare(
  queryClient: QueryClient,
  personal: AuthenticatedWorkspace,
  family: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.workspace(family) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(personal) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.myBalanceShares(personal) }),
  ]);
}
