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
        data={{
          savingsMinor: 12_500,
          savingsRatePercent: 25,
          recurringExpenses,
        }}
      />,
    );

    const savings = screen.getByText("Kept after spending").closest("article");

    expect(savings).toHaveAttribute("data-state", "positive");
    expect(savings).toHaveTextContent("Kept after spending");
  });

  it("marks a monthly shortfall with a negative state", () => {
    render(
      <InsightsPanel
        data={{
          savingsMinor: -4_200,
          savingsRatePercent: null,
          recurringExpenses,
        }}
      />,
    );

    const savings = screen.getByText("Monthly shortfall").closest("article");

    expect(savings).toHaveAttribute("data-state", "negative");
    expect(savings).toHaveTextContent("Add an income transaction to calculate a savings rate.");
  });
});
