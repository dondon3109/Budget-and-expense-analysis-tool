// @vitest-environment jsdom
import type { AccountRecord } from "@zoption/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BudgetRuleCalculator } from "../src/components/budgets/BudgetRuleCalculator";
import { setWorkspaceCurrency } from "../src/lib/workspaceCurrency";

afterEach(() => {
  cleanup();
  setWorkspaceCurrency("PHP");
});

const ACCOUNTS: AccountRecord[] = [
  {
    id: "acc-bank",
    name: "Payroll Bank",
    type: "checking",
    currency: "PHP",
    balanceMinor: 3_000_000,
    balancesByCurrency: { PHP: 3_000_000 },
    archived: false,
  },
  {
    id: "acc-usd",
    name: "USD Savings",
    type: "savings",
    currency: "USD",
    balanceMinor: 100_000,
    balancesByCurrency: { USD: 100_000 },
    archived: false,
  },
  {
    id: "acc-zero",
    name: "Empty Wallet",
    type: "cash",
    currency: "PHP",
    balanceMinor: 0,
    balancesByCurrency: { PHP: 0 },
    archived: false,
  },
  {
    id: "acc-neg",
    name: "Credit Card",
    type: "credit",
    currency: "PHP",
    balanceMinor: -50_000,
    balancesByCurrency: { PHP: -50_000 },
    archived: false,
  },
  {
    id: "acc-archived",
    name: "Old Bank",
    type: "checking",
    currency: "PHP",
    balanceMinor: 900_000,
    balancesByCurrency: { PHP: 900_000 },
    archived: true,
  },
];

const CATEGORIES = [
  { id: "housing", name: "Housing", color: "#008300" },
  { id: "food", name: "Food & dining", color: "#e87ba4" },
  { id: "leisure", name: "Leisure", color: "#eb6834" },
];

function results() {
  return screen
    .getAllByRole("article")
    .map((article) => article.querySelector("strong")?.textContent);
}

describe("BudgetRuleCalculator", () => {
  it("shows no amounts until income is entered", () => {
    render(<BudgetRuleCalculator />);
    expect(results()).toEqual(["—", "—", "—"]);
  });

  it("splits take-home pay 50/30/20", () => {
    render(<BudgetRuleCalculator />);
    fireEvent.change(screen.getByLabelText("Monthly take-home pay"), {
      target: { value: "30,000" },
    });
    expect(results()).toEqual(["₱15,000", "₱9,000", "₱6,000"]);
  });

  it("uses custom percentages and reports a split that does not add to 100", () => {
    render(<BudgetRuleCalculator />);
    fireEvent.change(screen.getByLabelText("Monthly take-home pay"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("Needs"), { target: { value: "60" } });
    expect(screen.getByRole("alert").textContent).toMatch(/add up to 110/);
    expect(results()).toEqual(["—", "—", "—"]);

    fireEvent.change(screen.getByLabelText("Wants"), { target: { value: "20" } });
    expect(results()).toEqual(["₱600", "₱200", "₱200"]);
    fireEvent.click(screen.getByRole("button", { name: "Reset to 50 / 30 / 20" }));
    expect(results()).toEqual(["₱500", "₱300", "₱200"]);
  });

  it("explains an invalid amount", () => {
    render(<BudgetRuleCalculator />);
    fireEvent.change(screen.getByLabelText("Monthly take-home pay"), {
      target: { value: "12.345" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(/two decimal places/);
  });

  it("follows the workspace currency", () => {
    setWorkspaceCurrency("USD");
    render(<BudgetRuleCalculator />);
    fireEvent.change(screen.getByLabelText("Monthly take-home pay"), {
      target: { value: "100" },
    });
    expect(results()[0]).toBe("$50");
  });

  it("auto-splits a selected active account balance and skips archived accounts", () => {
    render(<BudgetRuleCalculator accounts={ACCOUNTS} />);
    const source = screen.getByLabelText("Split from");
    expect(screen.queryByRole("option", { name: /Old Bank/ })).toBeNull();

    fireEvent.change(source, { target: { value: "acc-bank" } });
    expect(results()).toEqual(["₱15,000", "₱9,000", "₱6,000"]);

    fireEvent.change(source, { target: { value: "acc-usd" } });
    expect(results()).toEqual(["$500", "$300", "$200"]);

    // Typing a custom amount leaves the account source and returns to workspace currency.
    fireEvent.change(screen.getByLabelText("Monthly take-home pay"), {
      target: { value: "20000" },
    });
    expect((source as HTMLSelectElement).value).toBe("");
    expect(results()).toEqual(["₱10,000", "₱6,000", "₱4,000"]);
  });

  it("explains when a selected account has a zero or negative balance", () => {
    render(<BudgetRuleCalculator accounts={ACCOUNTS} />);
    const source = screen.getByLabelText("Split from");

    fireEvent.change(source, { target: { value: "acc-zero" } });
    expect(screen.getByRole("alert").textContent).toMatch(/zero balance/i);
    expect(results()).toEqual(["—", "—", "—"]);

    fireEvent.change(source, { target: { value: "acc-neg" } });
    expect(screen.getByRole("alert").textContent).toMatch(/negative balance/i);
    expect(results()).toEqual(["—", "—", "—"]);
  });

  it("applies exact split limits across assigned existing categories and blocks currency mismatch", () => {
    const onApply = vi.fn();
    render(
      <BudgetRuleCalculator
        accounts={ACCOUNTS}
        categories={CATEGORIES}
        applyTargetLabel="July 2026"
        onApply={onApply}
      />,
    );

    const applyButton = screen.getByRole("button", { name: "Apply to July 2026" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);

    // Pick Payroll Bank (₱30,000 -> Needs ₱15,000, Wants ₱9,000, Savings ₱6,000).
    fireEvent.change(screen.getByLabelText("Split from"), { target: { value: "acc-bank" } });

    const housingGroup = screen.getByRole("group", { name: "Housing bucket" });
    const foodGroup = screen.getByRole("group", { name: "Food & dining bucket" });
    const leisureGroup = screen.getByRole("group", { name: "Leisure bucket" });
    fireEvent.click(housingGroup.querySelectorAll("button")[0]!); // Needs
    fireEvent.click(foodGroup.querySelectorAll("button")[0]!); // Needs
    fireEvent.click(leisureGroup.querySelectorAll("button")[1]!); // Wants

    expect((applyButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledWith([
      { categoryId: "housing", limitMinor: 750_000 },
      { categoryId: "food", limitMinor: 750_000 },
      { categoryId: "leisure", limitMinor: 900_000 },
    ]);

    // Switching to a USD account in a PHP workspace blocks apply to avoid writing USD into PHP budgets.
    fireEvent.change(screen.getByLabelText("Split from"), { target: { value: "acc-usd" } });
    expect(screen.getByRole("alert").textContent).toMatch(/Budgets use PHP/);
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);
  });
});
