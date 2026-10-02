import { create } from "zustand";

import type { GoalProfile } from "@zoption/shared";

// The Worker owns the goal; this is only the last profile it returned this launch. `profile` stays
// null until a read succeeds, so an offline launch shows today's defaults and never the soft prompt.
interface GoalProfileState {
  profile: GoalProfile | null;
  /** The soft prompt opens at most once per launch, whether or not the user chooses. */
  prompted: boolean;
  setProfile: (profile: GoalProfile) => void;
  markPrompted: () => void;
  reset: () => void;
}

export const useGoalProfileStore = create<GoalProfileState>()((set) => ({
  profile: null,
  prompted: false,
  setProfile: (profile) => set({ profile }),
  markPrompted: () => set({ prompted: true }),
  reset: () => set({ profile: null, prompted: false }),
}));
