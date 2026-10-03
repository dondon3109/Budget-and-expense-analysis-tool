import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { markGoalShown, saveGoals, skipGoal } from "@/api/goal-profile";
import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { PrimaryGoalScreen } from "./PrimaryGoalScreen";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ subject: "user-1", getAccessToken: async () => "token" }),
}));
jest.mock("@/api/goal-profile", () => ({
  markGoalShown: jest.fn(async () => undefined),
  saveGoals: jest.fn(),
  skipGoal: jest.fn(),
}));

const BUDGET = "Create and stick to a monthly budget";
const DEBT = "Pay off debt / utang";
const saved = (goals: string[], otherText: string | null = null) =>
  ({ goals, otherText, selectedAt: "2026-10-02", skipped: false }) as never;

describe("PrimaryGoalScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGoalProfileStore.getState().reset();
    useGoalProfileStore
      .getState()
      .setProfile({ goals: [], otherText: null, selectedAt: null, skipped: false });
  });

  it("records that it was shown and disables Continue until something is picked", async () => {
    await render(<PrimaryGoalScreen />);
    expect(
      screen.getByText("Pick all that apply. The first one you tap is your main focus."),
    ).toBeTruthy();
    await waitFor(() => expect(markGoalShown).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Continue" }).props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.press(screen.getByRole("checkbox", { name: BUDGET }));
    expect(screen.getByRole("button", { name: "Continue" }).props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it("saves several goals in tap order only on Continue, then thanks the user", async () => {
    jest.mocked(saveGoals).mockResolvedValue(saved(["reduce_debt", "build_budget"]));
    await render(<PrimaryGoalScreen />);

    await fireEvent.press(screen.getByRole("checkbox", { name: DEBT }));
    await fireEvent.press(screen.getByRole("checkbox", { name: BUDGET }));
    expect(saveGoals).not.toHaveBeenCalled();
    expect(screen.getByText("Main focus")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Thank you!")).toBeTruthy();
    expect(saveGoals).toHaveBeenCalledWith(
      { accessToken: "token" },
      { goals: ["reduce_debt", "build_budget"], otherText: "" },
    );
    expect(useGoalProfileStore.getState().profile?.goals).toEqual(["reduce_debt", "build_budget"]);
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(router.back).toHaveBeenCalled();
  });

  it("sends the optional note with Other", async () => {
    jest.mocked(saveGoals).mockResolvedValue(saved(["other"], "pets"));
    await render(<PrimaryGoalScreen />);

    await fireEvent.press(screen.getByRole("checkbox", { name: "Other" }));
    await fireEvent.changeText(screen.getByLabelText("Tell us more (optional)"), "pets");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText("Thank you!");
    expect(saveGoals).toHaveBeenCalledWith(
      { accessToken: "token" },
      { goals: ["other"], otherText: "pets" },
    );
  });

  it("skips and leaves without a thank-you", async () => {
    jest
      .mocked(skipGoal)
      .mockResolvedValue({ goal: null, otherText: null, selectedAt: null, skipped: true });
    await render(<PrimaryGoalScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(screen.queryByText("Thank you!")).toBeNull();
    expect(useGoalProfileStore.getState().profile?.skipped).toBe(true);
  });

  it("stays usable offline: a failed save is not thanked and Skip still leaves", async () => {
    jest.mocked(saveGoals).mockRejectedValue(new Error("You are offline."));
    jest.mocked(skipGoal).mockRejectedValue(new Error("You are offline."));
    await render(<PrimaryGoalScreen />);

    await fireEvent.press(screen.getByRole("checkbox", { name: DEBT }));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("You are offline.")).toBeTruthy();
    expect(screen.queryByText("Thank you!")).toBeNull();
    expect(useGoalProfileStore.getState().profile?.goals).toEqual([]);

    await fireEvent.press(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});
