import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { saveMoneyPreferences } from "@/api/goal-profile";
import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { MoneyPreferencesCard } from "./MoneyPreferencesCard";

jest.mock("@/api/goal-profile", () => ({ saveMoneyPreferences: jest.fn() }));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ subject: "user-1", getAccessToken: async () => "token" }),
}));
jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

describe("MoneyPreferencesCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGoalProfileStore.getState().reset();
  });

  it("is hidden until the Worker answered", async () => {
    await render(<MoneyPreferencesCard />);
    expect(screen.queryByText("Money habits")).toBeNull();
  });

  it("summarizes the saved habits and saves a change", async () => {
    useGoalProfileStore.getState().setPreferences({
      incomeCadence: "weekly",
      budgetingStyle: null,
      spendingFocus: [],
    });
    jest.mocked(saveMoneyPreferences).mockImplementation(async (_api, input) => input);
    await render(<MoneyPreferencesCard />);

    await fireEvent.press(screen.getByRole("button", { name: "Money habits, Every week" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Not sure yet" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save money habits" }));

    await waitFor(() =>
      expect(saveMoneyPreferences).toHaveBeenCalledWith(
        { accessToken: "token" },
        { incomeCadence: "weekly", budgetingStyle: "not_sure", spendingFocus: [] },
      ),
    );
    expect(await screen.findByText("Saved. Your suggestions are updated.")).toBeTruthy();
    expect(useGoalProfileStore.getState().preferences?.budgetingStyle).toBe("not_sure");
  });
});
