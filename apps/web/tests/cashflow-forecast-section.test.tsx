// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SubscriptionMonthItem } from "@zoption/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CashflowForecastSection,
  type CashflowAccountOption,
} from "../src/components/subscriptions/CashflowForecastSection";

function getFutureDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const mockItem: SubscriptionMonthItem = {
  id: "sub-1",
  name: "Cloud Storage Pro",
  amountMinor: 50_000,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: getFutureDate(5),
  billingDate: getFutureDate(5),
  status: "active",
  categoryId: "tech",
  categoryName: "Technology",
  categoryColor: "#2563eb",
  accountId: "acc-1",
  accountName: "Checking Account",
  monthlyCostMinor: 50_000,
};

const mockItem60Days: SubscriptionMonthItem = {
  id: "sub-2",
  name: "Annual Domain",
  amountMinor: 30_000,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: getFutureDate(45),
  billingDate: getFutureDate(45),
  status: "active",
  categoryId: "tech",
  categoryName: "Technology",
  categoryColor: "#2563eb",
  accountId: "acc-1",
  accountName: "Checking Account",
  monthlyCostMinor: 30_000,
};

const mockAccounts: CashflowAccountOption[] = [
  {
    id: "acc-1",
    name: "Checking Account",
    balanceMinor: 200_000,
  },
  {
    id: "acc-2",
    name: "Savings Account",
    balanceMinor: 300_000,
  },
];

afterEach(cleanup);

describe("CashflowForecastSection", () => {
  it("renders header title and horizon toggle buttons (30, 60, 90 days)", () => {
    render(<CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Upcoming Balance & Obligation Forecast",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cashflow Projection")).toBeInTheDocument();

    const horizonGroup = screen.getByRole("group", { name: "Forecast horizon" });
    expect(horizonGroup).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "30 Days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "60 Days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90 Days" })).toBeInTheDocument();

    // Default horizon is 30 Days
    expect(screen.getByRole("button", { name: "30 Days" })).toHaveClass("active");
  });

  it("changes horizon when clicking 60 or 90 days", () => {
    render(<CashflowForecastSection items={[mockItem, mockItem60Days]} accounts={mockAccounts} />);

    const btn30 = screen.getByRole("button", { name: "30 Days" });
    const btn60 = screen.getByRole("button", { name: "60 Days" });
    const btn90 = screen.getByRole("button", { name: "90 Days" });

    // Switch to 60 Days
    fireEvent.click(btn60);
    expect(btn60).toHaveClass("active");
    expect(btn30).not.toHaveClass("active");
    expect(screen.getByText(/At day 60/)).toBeInTheDocument();

    // Switch to 90 Days
    fireEvent.click(btn90);
    expect(btn90).toHaveClass("active");
    expect(btn60).not.toHaveClass("active");
    expect(screen.getByText(/At day 90/)).toBeInTheDocument();
  });

  it("displays deficit warning alert when starting balance is low/zero and bills exist", () => {
    const lowBalanceAccounts: CashflowAccountOption[] = [
      {
        id: "acc-1",
        name: "Checking Account",
        balanceMinor: 0,
      },
    ];

    render(<CashflowForecastSection items={[mockItem]} accounts={lowBalanceAccounts} />);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner).toBeInTheDocument();
    expect(screen.getByText("Deficit Risk Detected")).toBeInTheDocument();
    expect(
      screen.getByText(/Your balance is projected to fall below zero/),
    ).toBeInTheDocument();
  });

  it("displays safe status when starting balance is high", () => {
    const highBalanceAccounts: CashflowAccountOption[] = [
      {
        id: "acc-1",
        name: "Checking Account",
        balanceMinor: 500_000,
      },
    ];

    render(<CashflowForecastSection items={[mockItem]} accounts={highBalanceAccounts} />);

    const statusBanner = screen.getByRole("status");
    expect(statusBanner).toBeInTheDocument();
    expect(screen.getByText("Healthy Cashflow Projection")).toBeInTheDocument();
    expect(
      screen.getByText(/All upcoming bill obligations are safely covered across the next 30 days/),
    ).toBeInTheDocument();
  });

  it("lists upcoming bills and risk badges", () => {
    const lowBalanceAccounts: CashflowAccountOption[] = [
      {
        id: "acc-1",
        name: "Checking Account",
        balanceMinor: 10_000,
      },
    ];

    render(<CashflowForecastSection items={[mockItem]} accounts={lowBalanceAccounts} />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Upcoming Bill Obligations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cloud Storage Pro")).toBeInTheDocument();
    expect(screen.getAllByText("−₱500").length).toBeGreaterThanOrEqual(1);

    // 10_000 starting balance - 50_000 bill => deficit risk badge
    expect(screen.getByText("Deficit risk")).toBeInTheDocument();
  });
});
