import { create } from "zustand";

import type { OnboardingState } from "@zoption/shared";

// The Worker owns first-run setup; this is the last state it returned this launch. `state` stays
// null until a read succeeds, so an offline launch never shows the setup screen.
interface OnboardingStoreState {
  state: OnboardingState | null;
  /** The setup screen opens at most once per launch, whether or not the user finishes it. */
  prompted: boolean;
  /** Setup is on screen, so other first-launch prompts hold back. */
  open: boolean;
  /** Setup closed at least once this launch, so deferred prompts can run even if the user chose Not now. */
  dismissed: boolean;
  /** Bumped on every identity reset so an unmounting screen cannot write stale state into the next session. */
  sessionGeneration: number;
  setState: (state: OnboardingState) => void;
  markPrompted: () => void;
  setOpen: (open: boolean) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingStoreState>()((set) => ({
  state: null,
  prompted: false,
  open: false,
  dismissed: false,
  sessionGeneration: 0,
  setState: (state) => set({ state }),
  markPrompted: () => set({ prompted: true }),
  setOpen: (open) =>
    set((current) => ({
      open,
      dismissed: current.dismissed || (current.open && !open),
    })),
  reset: () =>
    set((current) => ({
      state: null,
      prompted: false,
      open: false,
      dismissed: false,
      sessionGeneration: current.sessionGeneration + 1,
    })),
}));
