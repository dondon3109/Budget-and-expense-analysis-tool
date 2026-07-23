// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { ArrowDownRight, WalletCards } from "lucide-react";
import { describe, expect, it } from "vitest";

import { OverviewStatBar } from "../src/components/dashboard/OverviewStatBar";

describe("OverviewStatBar", () => {
  it("renders locale-formatted summary metrics with a separately styled peso sign", () => {
    render(
      <OverviewStatBar
        items={[
          {
            label: "Money in",
            amountMinor: 1_000_000,
            detail: "Income received this month",
            icon: ArrowDownRight,
            tone: "sage",
          },
          {
            label: "Net position",
            amountMinor: -50_000,
            detail: "After all recorded spending",
            icon: WalletCards,
            tone: "ink",
          },
        ]}
      />,
    );

    const summary = screen.getByRole("region", { name: "Monthly summary" });
    const values = summary.querySelectorAll("strong");
    const currencySymbols = summary.querySelectorAll(".overview-stat-currency");

    expect(summary).toHaveClass("overview-stat-bar");
    expect(summary.querySelectorAll(".metric-card")).toHaveLength(0);
    expect(values[0]).toHaveTextContent("₱10,000");
    expect(values[1]).toHaveTextContent("-₱500");
    expect(currencySymbols).toHaveLength(2);
    expect(currencySymbols[0]).toHaveTextContent("₱");
    expect(currencySymbols[1]).toHaveTextContent("₱");
  });
});
