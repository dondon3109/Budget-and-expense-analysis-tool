import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";

import { useGoalProfileStore } from "@/stores/goal-profile-store";

import { PreferenceSuggestionsCard } from "./PreferenceSuggestionsCard";

const mockGoals = jest.fn();
const mockSubscriptions = jest.fn();
const mockSecureStore = new Map<string, string>();
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
}));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ subject: "user-1", status: "signed-in" }),
}));
jest.mock("@/db/local-workspace-state", () => ({
  useGoals: () => mockGoals(),
  useSubscriptions: () => mockSubscriptions(),
}));

describe("PreferenceSuggestionsCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureStore.clear();
    useGoalProfileStore.getState().reset();
    mockGoals.mockReturnValue({ goals: [], loading: false });
    mockSubscriptions.mockReturnValue({ subscriptions: [{ id: "bill" }], loading: false });
  });

  it("renders nothing and reads nothing without money habits", async () => {
    await render(<PreferenceSuggestionsCard hasBudget={false} />);
    expect(screen.queryByText("Suggested for you")).toBeNull();
    expect(mockGoals).not.toHaveBeenCalled();
  });

  it("lists the open suggestions, opens their screens, and persists dismissal", async () => {
    useGoalProfileStore.getState().setPreferences({
      incomeCadence: "irregular",
      budgetingStyle: "zero_based",
      spendingFocus: ["bills"],
    });
    const view = await render(<PreferenceSuggestionsCard hasBudget={false} />);

    expect(await screen.findByText("Suggested for you")).toBeTruthy();
    expect(screen.getByText("Give every peso a job")).toBeTruthy();
    // A bill already exists, so that suggestion is done.
    expect(screen.queryByText("Add your bills")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Build a buffer for lean months" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/goals");

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss suggestions" }));
    expect(screen.queryByText("Suggested for you")).toBeNull();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "zoption.preference-suggestions.dismissed.user-1",
      "true",
    );

    await view.unmount();
    await render(<PreferenceSuggestionsCard hasBudget={false} />);
    await waitFor(() =>
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        "zoption.preference-suggestions.dismissed.user-1",
      ),
    );
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
