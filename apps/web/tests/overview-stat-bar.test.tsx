// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { ArrowDownRight, ArrowUpRight, WalletCards } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import { OverviewStatBar } from "../src/components/dashboard/OverviewStatBar";

afterEach(cleanup);

describe("OverviewStatBar", () => {
  it("renders locale-formatted summary metrics with a separately styled peso sign", () => {
    render(
      <OverviewStatBar
        items={[
          {
            label: "Money in",
            amounts: [{ amountMinor: 1_000_000, currency: "PHP" }],
            detail: "Income received this month",
            icon: ArrowDownRight,
            tone: "income",
            trend: { percentage: 12.5, comparison: "vs Jun", state: "positive" },
          },
          {
            label: "Money out",
            amounts: [{ amountMinor: 250_000, currency: "PHP" }],
            detail: "25% of monthly income",
            icon: ArrowUpRight,
            tone: "expense",
            trend: { percentage: -7.5, comparison: "vs Jun", state: "positive" },
          },
          {
            label: "Net position",
            amounts: [{ amountMinor: -50_000, currency: "PHP" }],
            detail: "After all recorded spending",
            icon: WalletCards,
            tone: "ink",
            trend: { percentage: 0, comparison: "vs Jun", state: "neutral" },
          },
        ]}
      />,
    );

    const summary = screen.getByRole("region", { name: "Monthly summary" });
    const values = summary.querySelectorAll("strong");
    const currencySymbols = summary.querySelectorAll(".overview-stat-currency");
    const trends = summary.querySelectorAll(".overview-stat-trend");

    expect(summary).toHaveClass("overview-stat-bar");
    expect(summary.querySelector(".tone-income .overview-stat-icon")).toBeInTheDocument();
    expect(summary.querySelector(".tone-expense .overview-stat-icon")).toBeInTheDocument();
    expect(summary.querySelectorAll(".metric-card")).toHaveLength(0);
    expect(values[0]).toHaveTextContent("₱10,000");
    expect(values[1]).toHaveTextContent("₱2,500");
    expect(values[2]).toHaveTextContent("-₱500");
    expect(currencySymbols).toHaveLength(3);
    expect(currencySymbols[0]).toHaveTextContent("₱");
    expect(currencySymbols[1]).toHaveTextContent("₱");
    expect(currencySymbols[2]).toHaveTextContent("₱");
    expect(trends).toHaveLength(3);
    expect(trends[0]).toHaveTextContent("+12.5%vs Jun");
    expect(trends[0]).toHaveAttribute("data-state", "positive");
    expect(trends[1]).toHaveTextContent("-7.5%vs Jun");
    expect(trends[1]).toHaveAttribute("data-state", "positive");
    expect(trends[2]).toHaveTextContent("0%vs Jun");
    expect(trends[2]).toHaveAttribute("data-state", "neutral");
  });

  it("shows a secondary US-dollar line after the primary peso value", () => {
    render(
      <OverviewStatBar
        items={[
          {
            label: "Income",
            amounts: [
              { amountMinor: 1_000_000, currency: "PHP" },
              { amountMinor: 50_000, currency: "USD" },
            ],
            detail: "Income received this month",
            icon: ArrowDownRight,
            tone: "income",
          },
        ]}
      />,
    );

    const summary = screen.getByRole("region", { name: "Monthly summary" });
    const values = summary.querySelectorAll("strong");
    const secondary = summary.querySelectorAll(".overview-stat-secondary span");

    expect(values[0]).toHaveTextContent("₱10,000");
    expect(secondary).toHaveLength(1);
    expect(secondary[0]).toHaveTextContent("$500");
    expect(secondary[0]).toHaveTextContent("USD");
  });
});
