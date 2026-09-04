import { fireEvent, render, screen } from "@testing-library/react-native";

import { projectCashflow } from "@zoption/shared";
import { CashflowForecastCard } from "./CashflowForecastCard";
import { formatMoneyMinor } from "@/ui/components/MoneyValue";

const START_DATE = "2026-09-01";

const monthlyBill = {
  id: "sub-netflix",
  name: "Netflix",
  amountMinor: 54900,
  billingCycle: "monthly" as const,
  nextBillingDate: "2026-09-10",
  status: "active",
};

const baseProps = {
  startingBalanceMinor: 500_000,
  subscriptions: [monthlyBill],
  startDate: START_DATE,
};

describe("CashflowForecastCard", () => {
  it("renders 30/60/90-day balance projections matching the shared forecast", async () => {
    await render(<CashflowForecastCard {...baseProps} />);

    for (const horizon of [30, 60, 90] as const) {
      const expected = projectCashflow({ ...baseProps, horizonDays: horizon });
      expect(
        screen.getAllByText(formatMoneyMinor(expected.endingBalanceMinor, "PHP"))[0],
      ).toBeTruthy();
    }

    expect(screen.getByRole("tab", { name: "30-day forecast" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "60-day forecast" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "90-day forecast" })).toBeTruthy();
  });

  it("lists upcoming bills and renewals with due dates", async () => {
    await render(<CashflowForecastCard {...baseProps} />);

    expect(screen.getByText("Upcoming bills and renewals")).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText("Due 2026-09-10 · in 9 days")).toBeTruthy();
  });

  it("shows an on-track status when the balance stays above the buffer", async () => {
    await render(<CashflowForecastCard {...baseProps} safetyBufferMinor={10_000} />);

    expect(screen.getAllByText("On track")[0]).toBeTruthy();
    expect(screen.getByText("Lowest balance")).toBeTruthy();
  });

  it("warns when the balance dips below the buffer without going negative", async () => {
    await render(
      <CashflowForecastCard {...baseProps} safetyBufferMinor={480_000} />,
    );

    expect(screen.getByText("Buffer warning")).toBeTruthy();
    expect(screen.getByText("Low buffer")).toBeTruthy();
  });

  it("flags deficit risk with the dip date when a bill drives the balance negative", async () => {
    await render(
      <CashflowForecastCard
        startingBalanceMinor={50_000}
        subscriptions={[monthlyBill]}
        startDate={START_DATE}
      />,
    );

    expect(screen.getAllByText("Deficit risk")[0]).toBeTruthy();
    expect(
      screen.getByLabelText("Deficit risk: Balance projected below zero on 2026-09-10."),
    ).toBeTruthy();
  });

  it("expands the renewal list when switching to a longer horizon", async () => {
    const laterBill = {
      id: "sub-domain",
      name: "Domain renewal",
      amountMinor: 1_00000,
      billingCycle: "monthly" as const,
      nextBillingDate: "2026-10-20",
      status: "active",
    };
    await render(
      <CashflowForecastCard
        startingBalanceMinor={1_000_000}
        subscriptions={[monthlyBill, laterBill]}
        startDate={START_DATE}
      />,
    );

    expect(screen.queryByText("Domain renewal")).toBeNull();

    await fireEvent.press(screen.getByRole("tab", { name: "90-day forecast" }));

    expect(screen.getAllByText("Domain renewal")[0]).toBeTruthy();
    expect(screen.getByText("Due 2026-10-20 · in 49 days")).toBeTruthy();
  });

  it("renders an empty state when there are no upcoming bills", async () => {
    await render(
      <CashflowForecastCard startingBalanceMinor={500_000} subscriptions={[]} />,
    );

    expect(
      screen.getByText("No upcoming bills or renewals in the next 30 days."),
    ).toBeTruthy();
    expect(screen.getByText("On track")).toBeTruthy();
  });

  it("navigates to subscriptions when the link is pressed", async () => {
    const onViewSubscriptions = jest.fn();
    await render(
      <CashflowForecastCard {...baseProps} onViewSubscriptions={onViewSubscriptions} />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "View subscriptions" }));
    expect(onViewSubscriptions).toHaveBeenCalledTimes(1);
  });
});
