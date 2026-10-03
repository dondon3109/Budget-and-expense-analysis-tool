import { create } from "zustand";

import type { OnboardingState } from "@zoption/shared";

// The Worker owns first-run setup; this is the last state it returned this launch. `state` stays
// null until a read succeeds, so an offline launch never shows the setup screen.
interface OnboardingStoreState {
  state: OnboardingState | null;
  /** The setup screen opens at most once per launch, whether or not the user finishes it. */
  prompted: boolean;
  setState: (state: OnboardingState) => void;
  markPrompted: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingStoreState>()((set) => ({
  state: null,
  prompted: false,
  setState: (state) => set({ state }),
  markPrompted: () => set({ prompted: true }),
  reset: () => set({ state: null, prompted: false }),
}));
