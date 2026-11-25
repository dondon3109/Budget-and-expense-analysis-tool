import type { PetColor, PetEggChoice, PetView } from "@zoption/shared";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { checkInPet, choosePetEgg, hatchPet, setPetColor, setPetEnabled } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

/**
 * The pet, read through a check-in. A check-in counts once per Manila day on the Worker, so
 * reading it on open and on each return to the tab is what the phone app does on foreground.
 */
export function petQueryOptions(workspace: AuthenticatedWorkspace) {
  return queryOptions({
    queryKey: queryKeys.pet(workspace),
    queryFn: () => checkInPet(workspace),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function usePet(workspace: AuthenticatedWorkspace) {
  return useQuery(petQueryOptions(workspace));
}

/** Every write returns the new view, which replaces the cached one. */
function usePetWrite<Input>(
  workspace: AuthenticatedWorkspace,
  save: (workspace: AuthenticatedWorkspace, input: Input) => Promise<PetView>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => save(workspace, input),
    onSuccess: (pet) => queryClient.setQueryData(queryKeys.pet(workspace), pet),
  });
}

export function useChoosePetEgg(workspace: AuthenticatedWorkspace) {
  return usePetWrite<PetEggChoice>(workspace, choosePetEgg);
}

export function useSetPetColor(workspace: AuthenticatedWorkspace) {
  return usePetWrite<PetColor>(workspace, setPetColor);
}

export function useSetPetEnabled(workspace: AuthenticatedWorkspace) {
  return usePetWrite<boolean>(workspace, setPetEnabled);
}

/** Hatches a ready egg; `beforeShow` runs after the Worker agrees, before the Baby is cached. */
export function useHatchPet(workspace: AuthenticatedWorkspace) {
  return usePetWrite<() => Promise<void>>(workspace, async (workspace, beforeShow) => {
    const pet = await hatchPet(workspace);
    await beforeShow();
    return pet;
  });
}

const pendingPetRefreshes = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Refreshes the personal pet after activity that can earn points or heal it. Because the Worker
 * credits rows only through the last finished whole second (`datetime('now')`), a loaded cache also
 * schedules one follow-up invalidation just past that 1-second boundary.
 */
export function invalidatePet(queryClient: QueryClient, workspace: AuthenticatedWorkspace) {
  if (workspace.familyId) return Promise.resolve();
  const key = queryKeys.pet(workspace);
  if (queryClient.getQueryData(key) !== undefined) {
    const existing = pendingPetRefreshes.get(workspace.key);
    if (existing) clearTimeout(existing);
    pendingPetRefreshes.set(
      workspace.key,
      setTimeout(() => {
        pendingPetRefreshes.delete(workspace.key);
        void queryClient.invalidateQueries({ queryKey: key });
      }, 1_100),
    );
  }
  return queryClient.invalidateQueries({ queryKey: key });
}
