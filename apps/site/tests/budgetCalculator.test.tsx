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

  it("shows an error instead of crashing on a negative income", () => {
    const { container } = render(<BudgetCalculator />);

    fireEvent.change(container.querySelector("#calc-income")!, { target: { value: "-500" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount of zero or more.");
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

  it("handles declarative WebMCP budget split submissions and rejects bad totals", async () => {
    render(<BudgetCalculator />);

    const form = document.querySelector<HTMLFormElement>(
      'form[toolname="calculate-budget-split"]',
    )!;
    expect(form).toHaveAttribute("toolautosubmit", "");

    const income = form.querySelector<HTMLInputElement>('input[name="income"]')!;
    const needs = form.querySelector<HTMLInputElement>('input[name="needs"]')!;
    const wants = form.querySelector<HTMLInputElement>('input[name="wants"]')!;
    const savings = form.querySelector<HTMLInputElement>('input[name="savings"]')!;

    fireEvent.change(income, { target: { value: "40000" } });
    fireEvent.change(needs, { target: { value: "60" } });
    fireEvent.change(wants, { target: { value: "20" } });
    fireEvent.change(savings, { target: { value: "20" } });

    let responsePromise: Promise<unknown> | undefined;
    form.dispatchEvent(
      Object.assign(new Event("submit", { bubbles: true, cancelable: true }), {
        agentInvoked: true,
        respondWith: (promise: Promise<unknown>) => {
          responsePromise = promise;
        },
      }),
    );

    await expect(responsePromise).resolves.toEqual({
      monthlyTakeHomeMinor: 4_000_000,
      percentages: { needs: 60, wants: 20, savings: 20 },
      allocationMinor: { needs: 2_400_000, wants: 800_000, savings: 800_000 },
      paydayEstimateMinor: { needs: 1_200_000, wants: 400_000, savings: 400_000 },
    });

    fireEvent.change(savings, { target: { value: "30" } });
    let errorPromise: Promise<unknown> | undefined;
    form.dispatchEvent(
      Object.assign(new Event("submit", { bubbles: true, cancelable: true }), {
        agentInvoked: true,
        respondWith: (promise: Promise<unknown>) => {
          errorPromise = promise;
        },
      }),
    );

    await expect(errorPromise).resolves.toEqual({
      error: "Needs, wants, and savings must add up to 100% (got 110%).",
    });

    fireEvent.change(savings, { target: { value: "20" } });
    fireEvent.change(income, { target: { value: "-500" } });
    let negativePromise: Promise<unknown> | undefined;
    form.dispatchEvent(
      Object.assign(new Event("submit", { bubbles: true, cancelable: true }), {
        agentInvoked: true,
        respondWith: (promise: Promise<unknown>) => {
          negativePromise = promise;
        },
      }),
    );

    await expect(negativePromise).resolves.toEqual({ error: "Enter an amount of zero or more." });
  });
});
