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
    expect(amountInput).toHaveValue("1000");

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

  it("scopes every comparison header and names the table for assistive tech", () => {
    render(<RemittanceCalculatorSection />);

    const table = screen.getByRole("table", { name: "Provider spread and value comparison" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers).toHaveLength(5);
    for (const header of headers) {
      expect(header).toHaveAttribute("scope", "col");
    }
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

  it("rejects a negative amount instead of quietly treating it as zero", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const amountInput = screen.getByLabelText(/Send Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "-5");

    expect(screen.getByText("Enter an amount greater than zero.")).toBeInTheDocument();
    expect(amountInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Waiting for a valid amount")).toBeInTheDocument();
  });

  it("rejects a third decimal place instead of silently rounding it", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const amountInput = screen.getByLabelText(/Send Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "10.555");

    expect(
      screen.getByText("Enter a valid amount with no more than two decimal places."),
    ).toBeInTheDocument();
    expect(amountInput).toHaveAttribute("aria-invalid", "true");
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

  it("waits for a valid amount instead of showing a confident zero", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const amountInput = screen.getByLabelText(/Send Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "abc");

    expect(
      screen.getByText("Enter a valid amount with no more than two decimal places."),
    ).toBeInTheDocument();
    expect(amountInput).toHaveAttribute("aria-invalid", "true");

    // The results column states that it is waiting rather than reporting ₱0 as an answer.
    expect(screen.getByText("Waiting for a valid amount")).toBeInTheDocument();
    expect(screen.queryByText("Recipient Receives in Philippines")).not.toBeInTheDocument();
    expect(screen.queryByText("₱0")).not.toBeInTheDocument();
    expect(screen.queryByText(/Based on sending/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best Value:/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Provider comparison is waiting for a valid send amount."),
    ).toBeInTheDocument();
  });

  it("waits for a valid amount when the amount is cleared or zero", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const amountInput = screen.getByLabelText(/Send Amount/i);
    await user.clear(amountInput);

    // An empty amount is the most common unusable input, and it must not read as "send nothing".
    expect(screen.getByText("Waiting for a valid amount")).toBeInTheDocument();
    expect(screen.queryByText(/Best Value:/)).not.toBeInTheDocument();

    await user.type(amountInput, "0");

    expect(screen.getByText("Waiting for a valid amount")).toBeInTheDocument();
    expect(screen.queryByText("Recipient Receives in Philippines")).not.toBeInTheDocument();
  });

  it("keeps the provider comparison priced when only the fee is unreadable", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const feeInput = screen.getByLabelText(/Upfront Transfer Fee/i);
    await user.clear(feeInput);
    await user.type(feeInput, "abc");

    // The comparison never reads the fee, so the send amount is still priced and the best value
    // is still a fact; only the fee-dependent results column waits.
    expect(
      screen.getByText("Enter a valid amount with no more than two decimal places."),
    ).toBeInTheDocument();
    expect(screen.getByText("Best Value: Wise")).toBeInTheDocument();
    expect(screen.getByText("Waiting for a valid amount")).toBeInTheDocument();
  });

  it("brings the real figures back once the amount is valid again", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    const amountInput = screen.getByLabelText(/Send Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "10.555");
    expect(screen.getByText("Waiting for a valid amount")).toBeInTheDocument();

    await user.clear(amountInput);
    await user.type(amountInput, "2000");

    expect(screen.queryByText("Waiting for a valid amount")).not.toBeInTheDocument();
    // 2000 USD * 56.50 * (1 - 0.005) = ₱112,435
    expect(screen.getAllByText("₱112,435").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Best Value: Wise")).toBeInTheDocument();
  });

  it("rejects a custom rate with trailing junk instead of reading its leading digits", async () => {
    const user = userEvent.setup();
    render(<RemittanceCalculatorSection />);

    await user.click(screen.getByRole("checkbox", { name: /Override with custom exchange rate/i }));
    const rateInput = screen.getByLabelText(/Custom 1 USD in PHP/i);
    await user.clear(rateInput);
    await user.type(rateInput, "12abc");

    expect(
      screen.getByText("Enter an exchange rate greater than zero, such as 56.50."),
    ).toBeInTheDocument();
    expect(rateInput).toHaveAttribute("aria-invalid", "true");
    // A rate of 12 would have produced ₱12,000, so nothing may be priced at it. The comparison
    // prices the send amount alone and stays correct, while the rate-dependent results wait.
    expect(screen.queryByText("₱12,000")).not.toBeInTheDocument();
    expect(screen.getByText("Best Value: Wise")).toBeInTheDocument();
    expect(screen.getByText("Waiting for a valid amount")).toBeInTheDocument();
  });
});
