// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { DashboardSummary } from "@zoption/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InsightsPanel } from "../src/components/dashboard/InsightsPanel";

const recurringExpenses: DashboardSummary["insights"]["recurringExpenses"] = [];

afterEach(cleanup);

describe("InsightsPanel", () => {
  it("marks positive savings with a positive state", () => {
    render(
      <InsightsPanel
        monthLabel="July 2026"
        data={{
          savingsMinor: 12_500,
          savingsRatePercent: 25,
          recurringExpenses,
        }}
      />,
    );

    const savings = screen.getByText("Income left after expenses").closest("article");

    expect(savings).toHaveAttribute("data-state", "positive");
    expect(savings).toHaveTextContent("25% of July 2026 income remained after expenses");
    expect(savings).toHaveTextContent("Transfers are excluded.");
  });

  it("marks a monthly shortfall with a negative state", () => {
    render(
      <InsightsPanel
        monthLabel="July 2026"
        data={{
          savingsMinor: -4_200,
          savingsRatePercent: null,
          recurringExpenses,
        }}
      />,
    );

    const savings = screen.getByText("Expenses exceeded income by").closest("article");

    expect(savings).toHaveAttribute("data-state", "negative");
    expect(savings).toHaveTextContent("No income was recorded in July 2026.");
    expect(savings).toHaveTextContent("Transfers are excluded.");
  });
});
