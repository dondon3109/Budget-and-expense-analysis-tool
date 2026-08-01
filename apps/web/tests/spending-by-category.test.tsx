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
});
