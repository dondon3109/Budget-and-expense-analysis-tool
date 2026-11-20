import { create } from "zustand";

import type { GoalsProfile, MoneyPreferences, PrimaryGoal } from "@zoption/shared";

// The Worker owns the goal; this is only the last profile it returned this launch. `profile` stays
// null until a read succeeds, so an offline launch shows today's defaults and never the soft prompt.
interface GoalProfileState {
  profile: GoalsProfile | null;
  /** The money habits, read with the goal; null until a read succeeds. */
  preferences: MoneyPreferences | null;
  /** The soft prompt opens at most once per launch, whether or not the user chooses. */
  prompted: boolean;
  setProfile: (profile: GoalsProfile) => void;
  setPreferences: (preferences: MoneyPreferences) => void;
  markPrompted: () => void;
  reset: () => void;
}

export const useGoalProfileStore = create<GoalProfileState>()((set) => ({
  profile: null,
  preferences: null,
  prompted: false,
  setProfile: (profile) => set({ profile }),
  setPreferences: (preferences) => set({ preferences }),
  markPrompted: () => set({ prompted: true }),
  reset: () => set({ profile: null, preferences: null, prompted: false }),
}));

/** The lead goal (the first pick) that drives personalization; null for no goal or an unknown profile. */
export function useLeadGoal(): PrimaryGoal | null {
  return useGoalProfileStore((state) => state.profile?.goals[0] ?? null);
}
