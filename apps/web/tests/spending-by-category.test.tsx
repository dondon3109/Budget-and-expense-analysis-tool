// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpendingByCategory } from "../src/components/dashboard/SpendingByCategory";

afterEach(cleanup);

describe("SpendingByCategory", () => {
  it("offers a dedicated month picker and names the empty month state", () => {
    const onMonthChange = vi.fn();

    render(
      <MemoryRouter>
        <SpendingByCategory
          data={[]}
          month="2026-07"
          maxMonth="2026-08"
          onMonthChange={onMonthChange}
        />
      </MemoryRouter>,
    );

    const monthPicker = screen.getByRole("button", {
      name: "Spending breakdown month: July 2026",
    });
    expect(monthPicker).toHaveTextContent("July 2026");
    expect(screen.getByText("No expenses in this Month")).toBeInTheDocument();

    fireEvent.click(monthPicker);
    expect(screen.getByRole("button", { name: "September 2026" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "June 2026" }));
    expect(onMonthChange).toHaveBeenCalledWith("2026-06");
  });

  it("provides a keyboard-focusable scroll region for long category lists", () => {
    render(
      <MemoryRouter>
        <SpendingByCategory
          data={Array.from({ length: 12 }, (_, index) => ({
            categoryId: `category-${index}`,
            name: `Category ${index + 1}`,
            color: "#123456",
            amountMinor: 12_000 - index * 500,
            sharePercent: 10 - index * 0.5,
          }))}
          month="2026-08"
          maxMonth="2026-08"
          onMonthChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("region", { name: "Category spending list" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });
});
