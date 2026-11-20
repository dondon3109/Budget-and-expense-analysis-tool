import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { PreferenceSuggestionsCard } from "./PreferenceSuggestionsCard";

const mockGoals = jest.fn();
const mockSubscriptions = jest.fn();
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/db/local-workspace-state", () => ({
  useGoals: () => mockGoals(),
  useSubscriptions: () => mockSubscriptions(),
}));

describe("PreferenceSuggestionsCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGoalProfileStore.getState().reset();
    mockGoals.mockReturnValue({ goals: [], loading: false });
    mockSubscriptions.mockReturnValue({ subscriptions: [{ id: "bill" }], loading: false });
  });

  it("renders nothing and reads nothing without money habits", async () => {
    await render(<PreferenceSuggestionsCard hasBudget={false} />);
    expect(screen.queryByText("Suggested for you")).toBeNull();
    expect(mockGoals).not.toHaveBeenCalled();
  });

  it("lists the open suggestions, opens their screens, and can be dismissed", async () => {
    useGoalProfileStore.getState().setPreferences({
      incomeCadence: "irregular",
      budgetingStyle: "zero_based",
      spendingFocus: ["bills"],
    });
    await render(<PreferenceSuggestionsCard hasBudget={false} />);

    expect(screen.getByText("Suggested for you")).toBeTruthy();
    expect(screen.getByText("Give every peso a job")).toBeTruthy();
    // A bill already exists, so that suggestion is done.
    expect(screen.queryByText("Add your bills")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Build a buffer for lean months" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/goals");

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss suggestions" }));
    expect(screen.queryByText("Suggested for you")).toBeNull();
  });

  it("hides once every suggestion is done", async () => {
    useGoalProfileStore.getState().setPreferences({
      incomeCadence: "monthly",
      budgetingStyle: null,
      spendingFocus: [],
    });
    await render(<PreferenceSuggestionsCard hasBudget />);
    expect(screen.queryByText("Suggested for you")).toBeNull();
  });
});
