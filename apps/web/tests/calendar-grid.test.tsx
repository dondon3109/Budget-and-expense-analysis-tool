// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarMonthGrid } from "../src/components/calendar/CalendarMonthGrid";

afterEach(cleanup);

describe("CalendarMonthGrid", () => {
  it("renders daily money indicators and selects a day", () => {
    const onSelectDate = vi.fn();
    render(
      <CalendarMonthGrid
        month="2026-07"
        selectedDate="2026-07-01"
        today="2026-07-18"
        days={
          new Map([
            [
              "2026-07-18",
              {
                items: [],
                incomeMinor: 500_000,
                expenseMinor: 125_00,
                incomeCount: 1,
                expenseCount: 2,
                transferCount: 0,
              },
            ],
          ])
        }
        onSelectDate={onSelectDate}
      />,
    );

    const day = screen.getByRole("button", {
      name: /July 18, 2026, today, 1 money in transaction/i,
    });
    fireEvent.click(day);
    expect(onSelectDate).toHaveBeenCalledWith("2026-07-18");
  });

  it("moves focus selection by week with the keyboard", () => {
    const onSelectDate = vi.fn();
    render(
      <CalendarMonthGrid
        month="2026-07"
        selectedDate="2026-07-08"
        today="2026-07-18"
        days={new Map()}
        onSelectDate={onSelectDate}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /July 8, 2026, selected/i }), {
      key: "ArrowDown",
    });
    expect(onSelectDate).toHaveBeenCalledWith("2026-07-15");
  });
});
