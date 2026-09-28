import { queryOptions, type QueryClient } from "@tanstack/react-query";

import {
  getProviderConfigAudits,
  getProviderConfigs,
  getProviderCredentials,
  getProviderHealth,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

// The admin screens poll these at their own intervals and gate them on the admin flag, so callers
// spread the options and add `enabled` and `refetchInterval` themselves.

export function providerConfigsQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.providerConfigs(workspace),
    queryFn: () => getProviderConfigs(workspace),
  });
}

export function providerCredentialsQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.providerCredentials(workspace),
    queryFn: () => getProviderCredentials(workspace),
  });
}

export function providerConfigAuditsQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.providerConfigAudits(workspace),
    queryFn: () => getProviderConfigAudits(workspace),
  });
}

export function providerHealthQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.providerHealth(workspace),
    queryFn: () => getProviderHealth(workspace),
  });
}

// Each helper below matches the exact set one kind of admin change has always refreshed. They
// differ on purpose; merge two only after checking the screens that depend on the difference.

/** Enabling, disabling, or reordering a configuration: its list and audit trail. */
export function invalidateAfterProviderConfigUpdate(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) }),
  ]);
}

/** Creating, activating, or deleting a configuration also changes the active route's health. */
export function invalidateAfterProviderRouteChange(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) }),
  ]);
}

/** Editing a configuration can link or create a credential as well. */
export function invalidateAfterProviderConfigEdit(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) }),
  ]);
}

/** Deleting a credential, or creating one while adding a configuration. */
export function invalidateProviderCredentials(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
}

export function invalidateAfterCredentialCreate(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) }),
  ]);
}

/** A renamed or rotated credential shows up in the configurations that use it. */
export function invalidateAfterCredentialUpdate(
  queryClient: QueryClient,
  workspace: AuthenticatedWorkspace,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) }),
  ]);
}
