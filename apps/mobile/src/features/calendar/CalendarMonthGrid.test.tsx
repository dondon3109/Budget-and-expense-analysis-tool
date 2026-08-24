import { fireEvent, render, screen } from "@testing-library/react-native";

import type { LocalCalendarDay } from "@/db/repository";
import { CalendarMonthGrid } from "./CalendarMonthGrid";

const activeDay: LocalCalendarDay = {
  date: "2026-08-24",
  events: [
    {
      id: "event-1",
      title: "Payday",
      date: "2026-08-24",
      startTime: null,
      endTime: null,
      notes: null,
      syncState: "synced",
    },
  ],
  subscriptionBills: [{ id: "bill-1", name: "Internet", amountMinor: 150_000 }],
  transactions: [
    { id: "transaction-1", description: "Salary", amountMinor: 500_000, kind: "income" },
  ],
};

describe("CalendarMonthGrid", () => {
  it("renders and selects every date even when most days have no activity", async () => {
    const onSelectDate = jest.fn();
    await render(
      <CalendarMonthGrid
        days={new Map([[activeDay.date, activeDay]])}
        month="2026-08-01"
        selectedDate="2026-08-24"
        today="2026-08-24"
        onSelectDate={onSelectDate}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(31);
    const selectedDay = screen.getByRole("button", {
      name: /August 24, 2026, today, selected, 1 event, 1 bill, 1 transaction/,
    });
    expect(selectedDay.props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(screen.getByRole("button", { name: /August 1, 2026/ }));
    expect(onSelectDate).toHaveBeenCalledWith("2026-08-01");
  });
});
