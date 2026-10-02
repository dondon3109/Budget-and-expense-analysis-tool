import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { markGoalShown, saveGoal, skipGoal } from "@/api/goal-profile";
import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { PrimaryGoalScreen } from "./PrimaryGoalScreen";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ subject: "user-1", getAccessToken: async () => "token" }),
}));
jest.mock("@/api/goal-profile", () => ({
  markGoalShown: jest.fn(async () => undefined),
  saveGoal: jest.fn(),
  skipGoal: jest.fn(),
}));

const saved = (goal: string, otherText: string | null = null) => ({
  goal,
  otherText,
  selectedAt: "2026-10-02",
  skipped: false,
});

describe("PrimaryGoalScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGoalProfileStore.getState().reset();
    useGoalProfileStore.getState().setProfile({
      goal: null,
      otherText: null,
      selectedAt: null,
      skipped: false,
    });
  });

  it("records that it was shown and saves a tapped goal", async () => {
    jest.mocked(saveGoal).mockResolvedValue(saved("build_budget") as never);
    await render(<PrimaryGoalScreen />);
    expect(screen.getByText("So we can set up the right starting point for you.")).toBeTruthy();
    await waitFor(() => expect(markGoalShown).toHaveBeenCalled());

    await fireEvent.press(
      screen.getByRole("radio", { name: "Create and stick to a monthly budget" }),
    );

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(saveGoal).toHaveBeenCalledWith({ accessToken: "token" }, { goal: "build_budget" });
    expect(useGoalProfileStore.getState().profile?.goal).toBe("build_budget");
  });

  it("saves the optional note only when Other is confirmed", async () => {
    jest.mocked(saveGoal).mockResolvedValue(saved("other", "pets") as never);
    await render(<PrimaryGoalScreen />);

    await fireEvent.press(screen.getByRole("radio", { name: "Other" }));
    expect(saveGoal).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Tell us more (optional)"), "pets");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(saveGoal).toHaveBeenCalledWith(
      { accessToken: "token" },
      { goal: "other", otherText: "pets" },
    );
  });

  it("skips and leaves", async () => {
    jest.mocked(skipGoal).mockResolvedValue({
      goal: null,
      otherText: null,
      selectedAt: null,
      skipped: true,
    });
    await render(<PrimaryGoalScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(useGoalProfileStore.getState().profile?.skipped).toBe(true);
  });

  it("stays usable offline: a failed save shows a message and Skip still leaves", async () => {
    jest.mocked(saveGoal).mockRejectedValue(new Error("You are offline."));
    jest.mocked(skipGoal).mockRejectedValue(new Error("You are offline."));
    await render(<PrimaryGoalScreen />);

    await fireEvent.press(screen.getByRole("radio", { name: "Pay off debt / utang" }));
    expect(await screen.findByText("You are offline.")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(useGoalProfileStore.getState().profile?.goal).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});
