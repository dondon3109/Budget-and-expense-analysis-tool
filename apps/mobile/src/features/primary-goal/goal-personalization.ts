import {
  goalConfigFor,
  leadStarterPrompts,
  preferenceStarterPrompt,
  type GoalCtaTarget,
  type MoneyPreferences,
  type PrimaryGoal,
} from "@zoption/shared";
import { router, type Href } from "expo-router";
import { useEffect } from "react";

import { openBills } from "@/features/budgets/open-bills";

import { useGoalProfileStore, useLeadGoal } from "@/stores/goal-profile-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

/** The shared config names web destinations; this maps each to its mobile screen. */
function hrefForTarget(
  goal: PrimaryGoal | null,
  target: Exclude<GoalCtaTarget, "/app/subscriptions">,
): Href {
  switch (target) {
    case "add_transaction":
      return "/(app)/add-transaction";
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

/** Opens a CTA or suggestion target on mobile. Bills open through `openBills`, as everywhere. */
export function openGoalTarget(goal: PrimaryGoal | null, target: GoalCtaTarget): void {
  if (target === "/app/subscriptions") {
    openBills();
    return;
  }
  router.push(hrefForTarget(goal, target));
}

/** The goal's first-action CTA for the empty home state, or null for today's default. */
export function useGoalCta(): { label: string; open: () => void } | null {
  const goal = useLeadGoal();
  const cta = goalConfigFor(goal).cta;
  if (!goal || !cta) return null;
  return { label: cta.label, open: () => openGoalTarget(goal, cta.target) };
}

/**
 * The goal's starter prompt leads, then the money habits' one; the list keeps its length. With
 * neither, the defaults are returned.
 */
export function promptsForGoal(
  defaults: readonly string[],
  goal: PrimaryGoal | null,
  preferences: MoneyPreferences | null = null,
): string[] {
  return leadStarterPrompts(defaults, [
    goalConfigFor(goal).starterPrompt,
    preferenceStarterPrompt(preferences),
  ]).slice(0, defaults.length);
}

/**
 * Opens the goal screen once per launch when the Worker says nothing was chosen or skipped.
 * A user who already chose or skipped, an offline launch (profile unknown), and the demo
 * workspace (never read) never see it. It waits for first-run setup to finish, which asks the
 * goals itself, so the two never stack.
 */
export function useGoalPrompt(): void {
  const profile = useGoalProfileStore((state) => state.profile);
  const prompted = useGoalProfileStore((state) => state.prompted);
  const setupDone = useOnboardingStore((state) => state.state?.step === "complete");
  const needsPrompt = Boolean(profile && profile.goals.length === 0 && !profile.skipped);

  useEffect(() => {
    if (!needsPrompt || prompted || !setupDone) return;
    useGoalProfileStore.getState().markPrompted();
    router.push("/(app)/primary-goal");
  }, [needsPrompt, prompted, setupDone]);
}
