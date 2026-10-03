import { create } from "zustand";

import type { PetView } from "@zoption/shared";

// The Worker owns the pet; this is only the last view it returned this launch. `pet` stays null
// until a read succeeds, so a guest or an offline launch shows no pet at all.
interface PetStoreState {
  pet: PetView | null;
  setPet: (pet: PetView) => void;
  reset: () => void;
}

export const usePetStore = create<PetStoreState>()((set) => ({
  pet: null,
  setPet: (pet) => set({ pet }),
  reset: () => set({ pet: null }),
}));
