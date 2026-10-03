import type { PetSpecies, PetView } from "@zoption/shared";
import { useCallback, useState } from "react";

import { choosePetEgg, getPet, setPetEnabled, type PetApi } from "@/api/pet";
import { useSessionSnapshot } from "@/auth/session-state";
import { usePetStore } from "@/stores/pet-store";

/** Reads and changes the pet on the Worker, keeping the store current. Every action needs a connection. */
export function usePetActions() {
  const { getAccessToken } = useSessionSnapshot();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (request: (api: PetApi) => Promise<PetView>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const accessToken = await getAccessToken(false);
        usePetStore.getState().setPet(await request({ accessToken }));
        return true;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Zoption could not reach your pet.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [getAccessToken],
  );

  return {
    busy,
    error,
    refresh: useCallback(() => run(getPet), [run]),
    chooseEgg: useCallback(
      (species: PetSpecies) => run((api) => choosePetEgg(api, species)),
      [run],
    ),
    setEnabled: useCallback((enabled: boolean) => run((api) => setPetEnabled(api, enabled)), [run]),
  };
}
