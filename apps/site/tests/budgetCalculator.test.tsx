// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  PUBLIC_ROUTE_METADATA,
  PUBLIC_ROUTE_PATHS,
  SITEMAP_ENTRIES,
} from "../src/seo/siteMetadata";
import { BudgetCalculator } from "../src/views/tools/BudgetCalculator";

const CALCULATOR_PATH = "/tools/50-30-20-calculator";

describe("budget calculator route", () => {
  it("is registered as an indexable public route", () => {
    expect(PUBLIC_ROUTE_PATHS).toContain(CALCULATOR_PATH);
    expect(PUBLIC_ROUTE_METADATA[CALCULATOR_PATH].robots).toBe("index,follow");
  });

  it("describes the tool in its title and description", () => {
    const { title, description } = PUBLIC_ROUTE_METADATA[CALCULATOR_PATH];
    expect(title).toMatch(/50\/30\/20/);
    expect(description.toLowerCase()).toContain("peso");
  });

  it("appears in the sitemap", () => {
    expect(SITEMAP_ENTRIES.map((entry) => entry.path)).toContain(CALCULATOR_PATH);
  });
});

describe("BudgetCalculator UI", () => {
  afterEach(cleanup);

  it("applies salary and split presets and shows per-payday estimates", () => {
    render(<BudgetCalculator />);

    fireEvent.click(screen.getByRole("button", { name: "₱50k" }));
    expect(screen.getByText("₱25,000")).toBeInTheDocument();
    expect(screen.getByText(/~₱12,500 per payday/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /60 \/ 20 \/ 20/ }));
    expect(screen.getByText("₱30,000")).toBeInTheDocument();
    expect(screen.getAllByText("₱10,000")).toHaveLength(2);
  });

  it("nudges percentages and auto-balances back to 100%", () => {
    render(<BudgetCalculator />);

    fireEvent.click(screen.getByRole("button", { name: "Increase Needs by 5%" }));
    expect(screen.getByText("Total: 105%")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/5% over 100%/);

    fireEvent.click(screen.getByRole("button", { name: "Balance to 100%" }));
    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    expect(screen.getByLabelText("Needs")).toHaveValue(55);
    expect(screen.getByLabelText("Wants")).toHaveValue(25);
    expect(screen.getByLabelText("Savings")).toHaveValue(20);
  });
});
