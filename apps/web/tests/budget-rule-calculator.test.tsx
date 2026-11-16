// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BudgetRuleCalculator } from "../src/components/budgets/BudgetRuleCalculator";
import { setWorkspaceCurrency } from "../src/lib/workspaceCurrency";

afterEach(() => {
  cleanup();
  setWorkspaceCurrency("PHP");
});

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
});
