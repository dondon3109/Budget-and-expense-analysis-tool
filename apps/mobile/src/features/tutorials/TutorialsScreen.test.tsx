import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { TutorialsScreen } from "./TutorialsScreen";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
  Stack: {
    Screen: () => null,
  },
}));

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ isInternetReachable: true, isConnected: true })),
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));

describe("TutorialsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders tutorial topics including How to Adjust Current Balances", async () => {
    await render(<TutorialsScreen />);

    expect(screen.getByText("Tutorials & user guide")).toBeTruthy();
    expect(screen.getByText("How to Adjust Current Balances")).toBeTruthy();
    expect(screen.getByText("How to Use Envelope Budgeting")).toBeTruthy();
    expect(screen.getByText("Fast Expense Entry: Receipts & Voice")).toBeTruthy();
    expect(screen.getByText("Managing Recurring Subscriptions")).toBeTruthy();
    expect(screen.getByText("Offline Storage & Privacy")).toBeTruthy();
  });

  it("shows steps for default expanded topic and handles action button press", async () => {
    await render(<TutorialsScreen />);

    expect(screen.getByText("1. Locate your Account")).toBeTruthy();
    expect(screen.getByText("2. View 'Adjust current balance'")).toBeTruthy();

    const actionButton = screen.getByRole("button", { name: "Manage accounts & adjust" });
    expect(actionButton).toBeTruthy();
    await fireEvent.press(actionButton);

    expect(router.push).toHaveBeenCalledWith("/(app)/money-setup");
  });

  it("allows toggling topics to expand and collapse", async () => {
    await render(<TutorialsScreen />);

    const budgetTopic = screen.getByRole("button", {
      name: "How to Use Envelope Budgeting, expand",
    });
    await fireEvent.press(budgetTopic);

    expect(screen.getByText("1. Go to the Budgets tab")).toBeTruthy();
    const openBudgetsBtn = screen.getByRole("button", { name: "Open Budgets" });
    expect(openBudgetsBtn).toBeTruthy();

    await fireEvent.press(openBudgetsBtn);
    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/budgets");
  });
});
