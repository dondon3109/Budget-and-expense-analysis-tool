import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { saveGoals } from "@/api/goal-profile";
import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { GoalSettingsCard } from "./GoalSettingsCard";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ subject: "user-1", getAccessToken: async () => "token" }),
}));
jest.mock("@/api/goal-profile", () => ({ saveGoals: jest.fn() }));

describe("GoalSettingsCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGoalProfileStore.getState().reset();
  });

  it("is hidden until the Worker has answered", async () => {
    await render(<GoalSettingsCard />);
    expect(screen.queryByText("Your goal")).toBeNull();
  });

  it("shows the saved goals and edits the same multi-select list", async () => {
    useGoalProfileStore.getState().setProfile({
      goals: ["build_budget"],
      otherText: null,
      selectedAt: "2026-10-02",
      skipped: false,
    });
    jest.mocked(saveGoals).mockResolvedValue({
      goals: ["build_budget", "reduce_debt"],
      otherText: null,
      selectedAt: "2026-10-02",
      skipped: false,
    });
    await render(<GoalSettingsCard />);

    await fireEvent.press(
      screen.getByRole("button", { name: "Your goal, Create and stick to a monthly budget" }),
    );
    await fireEvent.press(screen.getByRole("checkbox", { name: "Pay off debt / utang" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save goals" }));

    await waitFor(() =>
      expect(saveGoals).toHaveBeenCalledWith(
        { accessToken: "token" },
        { goals: ["build_budget", "reduce_debt"], otherText: "" },
      ),
    );
    expect(await screen.findByText("Thank you! Your goals are saved.")).toBeTruthy();
    expect(useGoalProfileStore.getState().profile?.goals).toEqual(["build_budget", "reduce_debt"]);
  });
});
