import { goalConfigFor, type GoalCtaTarget, type PrimaryGoal } from "@zoption/shared";
import { router, type Href } from "expo-router";
import { useEffect } from "react";

import { useGoalProfileStore } from "@/stores/goal-profile-store";

/** The shared config names web destinations; this maps each to its mobile screen. */
function hrefForTarget(goal: PrimaryGoal, target: GoalCtaTarget): Href {
  switch (target) {
    case "add_transaction":
      return "/(app)/transaction";
    case "import_wizard":
      return { pathname: "/(app)/import", params: { firstRun: "1" } };
    case "/app/budgets":
      return "/(app)/(tabs)/budgets";
    case "/app/assistant":
      return "/(app)/assistant";
    case "/app/plan":
      return goal === "reduce_debt" ? "/(app)/debts" : "/(app)/goals";
  }
}

/** The goal's first-action CTA for the empty home state, or null for today's default. */
export function useGoalCta(): { label: string; open: () => void } | null {
  const goal = useGoalProfileStore((state) => state.profile?.goal ?? null);
  const cta = goalConfigFor(goal).cta;
  if (!goal || !cta) return null;
  return { label: cta.label, open: () => router.push(hrefForTarget(goal, cta.target)) };
}

/** The goal's starter prompt leads; the list keeps its length. No goal returns the defaults. */
export function promptsForGoal(defaults: readonly string[], goal: PrimaryGoal | null): string[] {
  const starter = goalConfigFor(goal).starterPrompt;
  if (!starter) return [...defaults];
  return [starter, ...defaults.filter((prompt) => prompt !== starter)].slice(0, defaults.length);
}

/**
 * Opens the goal screen once per launch when the Worker says nothing was chosen or skipped.
 * A user who already chose or skipped, an offline launch (profile unknown), and the demo
 * workspace (never read) never see it.
 */
export function useGoalPrompt(): void {
  const profile = useGoalProfileStore((state) => state.profile);
  const prompted = useGoalProfileStore((state) => state.prompted);
  const needsPrompt = Boolean(profile && profile.goal === null && !profile.skipped);

  useEffect(() => {
    if (!needsPrompt || prompted) return;
    useGoalProfileStore.getState().markPrompted();
    router.push("/(app)/primary-goal");
  }, [needsPrompt, prompted]);
}
