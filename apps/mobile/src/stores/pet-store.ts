import { create } from "zustand";

import type { PetView } from "@zoption/shared";

// The Worker owns the pet; this is only the last view it returned this launch. `pet` stays null
// until a read succeeds, so a guest or an offline launch shows no pet at all.
interface PetStoreState {
  pet: PetView | null;
  /** The egg picker opens on its own at most once per launch. */
  introduced: boolean;
  setPet: (pet: PetView) => void;
  markIntroduced: () => void;
  reset: () => void;
}

export const usePetStore = create<PetStoreState>()((set) => ({
  pet: null,
  introduced: false,
  setPet: (pet) => set({ pet }),
  markIntroduced: () => set({ introduced: true }),
  reset: () => set({ pet: null, introduced: false }),
}));
