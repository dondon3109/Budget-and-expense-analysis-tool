// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { RemittanceCalculatorSection } from "../src/components/planning/RemittanceCalculatorSection";

afterEach(cleanup);

describe("RemittanceCalculatorSection", () => {
  it("renders header, mid-market rate benchmark, and default values", () => {
    render(<RemittanceCalculatorSection />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Remittance & FX Fee Calculator",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("OFW & Cross-Border Planning")).toBeInTheDocument();
    expect(screen.getByText("Mid-market Benchmark:")).toBeInTheDocument();
    expect(screen.getByText("1 USD = ₱56.50")).toBeInTheDocument();

    // Default Send Amount is 1000
    const amountInput = screen.getByLabelText(/Send Amount/i);
    expect(amountInput).toHaveValue(1000);

    // Shows recipient received amount
    expect(screen.getByText("Recipient Receives in Philippines")).toBeInTheDocument();
    expect(screen.getAllByText("Wise").length).toBeGreaterThanOrEqual(1);
  });

  it("updates calculated received amount when changing send amount", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const amountInput = screen.getByLabelText(/Send Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "2000");

    // 2000 USD * 56.50 * (1 - 0.005) = 2000 * 56.2175 = 112,435 PHP
    expect(screen.getAllByText("₱112,435").length).toBeGreaterThanOrEqual(1);
  });

  it("updates currency to EUR and updates benchmark exchange rate", () => {
    render(<RemittanceCalculatorSection />);

    const currencySelect = screen.getByLabelText("Send Currency");
    fireEvent.change(currencySelect, { target: { value: "EUR" } });

    expect(screen.getByText("1 EUR = ₱61.20")).toBeInTheDocument();
  });

  it("renders provider comparison table with Wise, Remitly, Western Union, Bank Wire", () => {
    render(<RemittanceCalculatorSection />);

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Provider Spread & Value Comparison",
      }),
    ).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getByText("Traditional Bank Wire")).toBeInTheDocument();
    expect(within(table).getByText("Western Union")).toBeInTheDocument();
    expect(within(table).getByText("Remitly")).toBeInTheDocument();
    expect(within(table).getByText("Mid-Market (Zero Spread)")).toBeInTheDocument();

    // Recommended badge for best commercial provider (Wise)
    expect(screen.getByText("Best Value: Wise")).toBeInTheDocument();
  });

  it("allows custom exchange rate override", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const checkbox = screen.getByRole("checkbox", {
      name: /Override with custom exchange rate/i,
    });
    await user.click(checkbox);

    const customRateInput = screen.getByLabelText(/Custom 1 USD in PHP/i);
    expect(customRateInput).toBeInTheDocument();

    await user.clear(customRateInput);
    await user.type(customRateInput, "60.00");

    // 1000 USD * 60.00 = ₱60,000
    expect(screen.getAllByText("₱60,000").length).toBeGreaterThanOrEqual(1);
  });

  it("calculates upfront fee into total fee drag", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const feeInput = screen.getByLabelText(/Upfront Transfer Fee/i);
    await user.clear(feeInput);
    await user.type(feeInput, "10");

    // Fee in PHP = 10 * 56.50 = ₱565
    expect(screen.getByText("−₱565")).toBeInTheDocument();
  });
});
