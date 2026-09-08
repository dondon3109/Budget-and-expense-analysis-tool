import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { QuickStartGuideCard } from "./QuickStartGuideCard";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

describe("QuickStartGuideCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders 4 onboarding steps and triggers navigation", async () => {
    await render(<QuickStartGuideCard firstAccountId="acc-cash-1" />);

    expect(screen.getByText("Quick start guide")).toBeTruthy();
    expect(screen.getByText("Adjust starting balances")).toBeTruthy();
    expect(screen.getByText("Set envelope budgets")).toBeTruthy();
    expect(screen.getByText("Log daily spending")).toBeTruthy();
    expect(screen.getByText("Tutorials & guides")).toBeTruthy();

    const adjustBtn = screen.getByRole("button", { name: "Adjust balance" });
    await fireEvent.press(adjustBtn);
    expect(router.push).toHaveBeenCalledWith("/(app)/reference?entityType=account&id=acc-cash-1");

    const budgetsBtn = screen.getByRole("button", { name: "Open Budgets" });
    await fireEvent.press(budgetsBtn);
    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/budgets");

    const addTxBtn = screen.getByRole("button", { name: "Log transaction" });
    await fireEvent.press(addTxBtn);
    expect(router.push).toHaveBeenCalledWith("/(app)/transaction");

    const tutorialsBtn = screen.getByRole("button", { name: "View tutorials" });
    await fireEvent.press(tutorialsBtn);
    expect(router.push).toHaveBeenCalledWith("/(app)/tutorials");
  });

  it("can be collapsed, expanded, dismissed, and reopened", async () => {
    await render(<QuickStartGuideCard firstAccountId="acc-cash-1" />);

    const collapseBtn = screen.getByRole("button", { name: "Collapse guide" });
    await fireEvent.press(collapseBtn);

    expect(screen.queryByText("Adjust starting balances")).toBeNull();

    const expandBtn = screen.getByRole("button", { name: "Expand guide" });
    await fireEvent.press(expandBtn);

    expect(screen.getByText("Adjust starting balances")).toBeTruthy();

    const dismissBtn = screen.getByRole("button", { name: "Dismiss guide" });
    await fireEvent.press(dismissBtn);

    expect(screen.queryByText("Adjust starting balances")).toBeNull();
    const reopenBanner = screen.getByRole("button", { name: "Reopen quick start guide" });
    expect(reopenBanner).toBeTruthy();

    await fireEvent.press(reopenBanner);
    expect(screen.getByText("Adjust starting balances")).toBeTruthy();
  });
});
