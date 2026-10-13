import type { PetSpecies, PetView } from "@zoption/shared";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { checkInPet, choosePetEgg, setPetEnabled } from "../lib/api";
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

/** Both writes return the new view, which replaces the cached one. */
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
  return usePetWrite<PetSpecies>(workspace, choosePetEgg);
}

export function useSetPetEnabled(workspace: AuthenticatedWorkspace) {
  return usePetWrite<boolean>(workspace, setPetEnabled);
}
