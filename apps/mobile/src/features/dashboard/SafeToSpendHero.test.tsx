import { fireEvent, render, screen } from "@testing-library/react-native";
import { useOverspendingNotification } from "@/features/reminders/overspending-notification";
import { SafeToSpendHero } from "./SafeToSpendHero";

jest.mock("@/features/reminders/overspending-notification", () => ({
  useOverspendingNotification: jest.fn(),
}));

const monthlyBill = {
  id: "sub-netflix",
  name: "Netflix",
  amountMinor: 54900,
  billingCycle: "monthly" as const,
  currency: "PHP" as const,
  nextBillingDate: "2026-09-10",
  status: "active",
};

/** A date a few days out, far enough that UTC and local "today" agree on it. */
function localDateInDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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
      screen.queryByText(
        "Keep spending minimal until your next planned deposit or balance adjustment.",
      ),
    ).toBeNull();
  });
  it("shows a getting-started line, not an alert, for an empty account", async () => {
    await render(<SafeToSpendHero startingBalanceMinor={0} subscriptions={[]} />);

    expect(
      screen.getByText("Add your balance or a first transaction to see what's safe to spend."),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(useOverspendingNotification).toHaveBeenLastCalledWith(null);
  });

  it("says when a plan billed in the other currency is left out", async () => {
    await render(
      <SafeToSpendHero
        startingBalanceMinor={500_000}
        remainingBudgetMinor={14_000}
        currency="PHP"
        subscriptions={[monthlyBill, { ...monthlyBill, id: "sub-usd", currency: "USD" as const }]}
      />,
    );

    expect(screen.getByText("1 plan billed in another currency isn't counted here.")).toBeTruthy();
  });

  it("raises no overspending alert while there is still something safe to spend", async () => {
    await render(<SafeToSpendHero startingBalanceMinor={500_000} subscriptions={[]} />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(useOverspendingNotification).toHaveBeenLastCalledWith(null);
  });

  it("alerts and notifies when the forecast shows a deficit", async () => {
    // A ₱549 renewal against a ₱100 balance takes it below zero on the renewal date.
    await render(
      <SafeToSpendHero
        startingBalanceMinor={10_000}
        subscriptions={[{ ...monthlyBill, nextBillingDate: localDateInDays(3) }]}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Deficit risk ahead")).toBeTruthy();
    expect(screen.queryByText(/projected to fall below zero/)).toBeNull();
    expect(useOverspendingNotification).toHaveBeenLastCalledWith({
      kind: "deficit_risk",
      deficitDate: localDateInDays(3),
    });
  });
});
