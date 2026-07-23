// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { ArrowDownRight } from "lucide-react";
import { describe, expect, it } from "vitest";

import { OverviewStatBar } from "../src/components/dashboard/OverviewStatBar";

describe("OverviewStatBar", () => {
  it("renders summary metrics in one shared stat bar", () => {
    render(
      <OverviewStatBar
        items={[
          {
            label: "Money in",
            value: "₱10,000",
            detail: "Income received this month",
            icon: ArrowDownRight,
            tone: "sage",
          },
        ]}
      />,
    );

    const summary = screen.getByRole("region", { name: "Monthly summary" });
    expect(summary).toHaveClass("overview-stat-bar");
    expect(summary.querySelectorAll(".metric-card")).toHaveLength(0);
    expect(screen.getByText("₱10,000")).toBeInTheDocument();
  });
});
