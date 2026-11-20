import { renderHook } from "@testing-library/react-native";
import { router } from "expo-router";

import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

import { openGoalTarget, promptsForGoal, useGoalCta, useGoalPrompt } from "./goal-personalization";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const defaults = ["a?", "b?", "c?"];
const profile = (goal: string | null, skipped = false) =>
  ({ goals: goal ? [goal] : [], otherText: null, selectedAt: null, skipped }) as never;

describe("goal personalization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGoalProfileStore.getState().reset();
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setState({ step: "complete", currency: "PHP" });
  });

  it("falls back to the default prompts without a goal, for other, and when skipped", () => {
    expect(promptsForGoal(defaults, null)).toEqual(defaults);
    expect(promptsForGoal(defaults, "other")).toEqual(defaults);
  });

  it("leads with the goal's starter prompt and keeps the list length", () => {
    expect(promptsForGoal(defaults, "build_budget")).toEqual([
      "Help me build a budget from my income",
      "a?",
      "b?",
    ]);
  });

  it("leads with the goal's prompt, then the money habits' prompt", () => {
    expect(
      promptsForGoal(defaults, "build_budget", {
        incomeCadence: "irregular",
        budgetingStyle: null,
        spendingFocus: [],
      }),
    ).toEqual([
      "Help me build a budget from my income",
      "How much should I set aside from a good month?",
      "a?",
    ]);
  });

  it("opens Bills for the bills target and the goals screen for a plan without a debt goal", () => {
    openGoalTarget(null, "/app/subscriptions");
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/(tabs)/budgets",
      params: { view: "bills" },
    });
    openGoalTarget(null, "/app/plan");
    expect(router.push).toHaveBeenLastCalledWith("/(app)/goals");
  });

  it("has no CTA by default and opens the mobile screen for a goal's CTA", async () => {
    const empty = await renderHook(() => useGoalCta());
    expect(empty.result.current).toBeNull();

    useGoalProfileStore.getState().setProfile(profile("reduce_debt"));
    const debt = await renderHook(() => useGoalCta());
    expect(debt.result.current?.label).toBe("Add a debt to track");
    debt.result.current?.open();
    expect(router.push).toHaveBeenCalledWith("/(app)/debts");
  });

  it("prompts once per launch, and never after a choice, a skip, or when unknown", async () => {
    await renderHook(() => useGoalPrompt());
    expect(router.push).not.toHaveBeenCalled();

    useGoalProfileStore.getState().setProfile(profile("track_spending"));
    await renderHook(() => useGoalPrompt());
    useGoalProfileStore.getState().setProfile(profile(null, true));
    await renderHook(() => useGoalPrompt());
    expect(router.push).not.toHaveBeenCalled();

    useGoalProfileStore.getState().setProfile(profile(null));
    await renderHook(() => useGoalPrompt());
    await renderHook(() => useGoalPrompt());
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/(app)/primary-goal");
  });

  it("waits for first-run setup to finish, since setup asks the goals itself", async () => {
    useOnboardingStore.getState().setState({ step: "cash", currency: "PHP" });
    useGoalProfileStore.getState().setProfile(profile(null));
    await renderHook(() => useGoalPrompt());
    expect(router.push).not.toHaveBeenCalled();
  });
});
