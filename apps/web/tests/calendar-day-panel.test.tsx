// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarDayPanel } from "../src/components/calendar/CalendarDayPanel";

const event = {
  id: "event-1",
  title: "Dentist",
  date: "2026-08-05",
  startTime: "09:30",
  endTime: "10:15",
  notes: "Bring insurance card",
};

afterEach(cleanup);

describe("CalendarDayPanel", () => {
  it("shows event details and edit action separately from transactions", () => {
    const onEditEvent = vi.fn();
    render(
      <CalendarDayPanel
        date="2026-08-05"
        items={[]}
        events={[event]}
        onAddTransaction={vi.fn()}
        onAddEvent={vi.fn()}
        onEditEvent={onEditEvent}
        onDeleteEvent={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("heading", { name: "Events" })).toBeVisible();
    expect(screen.getByText("9:30 AM–10:15 AM")).toBeVisible();
    expect(screen.getByText("Bring insurance card")).toBeVisible();
    expect(screen.queryByText("Nothing planned for this day.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Dentist" }));
    expect(onEditEvent).toHaveBeenCalledWith(event);
  });

  it("requires inline confirmation before deleting an event", async () => {
    const onDeleteEvent = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarDayPanel
        date="2026-08-05"
        items={[]}
        events={[event]}
        onAddTransaction={vi.fn()}
        onAddEvent={vi.fn()}
        onEditEvent={vi.fn()}
        onDeleteEvent={onDeleteEvent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Dentist" }));
    expect(onDeleteEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(onDeleteEvent).toHaveBeenCalledWith("event-1"));
  });
});
