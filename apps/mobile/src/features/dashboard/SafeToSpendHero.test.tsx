import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeToSpendHero } from "./SafeToSpendHero";

const monthlyBill = {
  id: "sub-netflix",
  name: "Netflix",
  amountMinor: 54900,
  billingCycle: "monthly" as const,
  nextBillingDate: "2026-09-10",
  status: "active",
};

describe("SafeToSpendHero (mobile)", () => {
  it("renders safe to spend hero with forward guidance", async () => {
    await render(
      <SafeToSpendHero
        startingBalanceMinor={500_000}
        remainingBudgetMinor={14_000}
        subscriptions={[monthlyBill]}
      />,
    );

    expect(screen.getByText("Safe to spend this week")).toBeTruthy();
    expect(screen.getByLabelText("Safe to spend this week")).toBeTruthy();
  });

  it("surfaces renewal button and triggers onViewRenewals when pressed", async () => {
    const onViewRenewals = jest.fn();
    await render(
      <SafeToSpendHero
        startingBalanceMinor={500_000}
        remainingBudgetMinor={14_000}
        subscriptions={[monthlyBill]}
        onViewRenewals={onViewRenewals}
      />,
    );

    const button = screen.getByRole("button", { name: "View renewal calendar" });
    expect(button).toBeTruthy();
    fireEvent.press(button);
    expect(onViewRenewals).toHaveBeenCalledTimes(1);
  });

  it("handles low/zero balance gracefully with non-shaming guidance", async () => {
    await render(
      <SafeToSpendHero
        startingBalanceMinor={0}
        remainingBudgetMinor={0}
        subscriptions={[monthlyBill]}
      />,
    );

    expect(screen.getByText("Safe to spend this week")).toBeTruthy();
    expect(
      screen.getByText("Keep spending minimal until your next planned deposit or balance adjustment."),
    ).toBeTruthy();
  });
});
