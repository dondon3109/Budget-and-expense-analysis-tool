// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CalendarEventInput } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getTransactionCalendar: vi.fn(),
  getSubscriptions: vi.fn(),
  getCalendarEvents: vi.fn(),
  getCategories: vi.fn(),
  getAccounts: vi.fn(),
  createTransaction: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/components/calendar/CalendarDayPanel", () => ({
  CalendarDayPanel: ({ date }: { date: string }) => <aside>Selected date: {date}</aside>,
}));

vi.mock("../src/components/transactions/TransactionForm", () => ({
  TransactionForm: () => null,
}));

vi.mock("../src/components/calendar/CalendarEventForm", () => ({
  CalendarEventForm: ({
    initialDate,
    onSubmit,
  }: {
    initialDate: string;
    onSubmit: (input: {
      title: string;
      date: string;
      startTime: null;
      endTime: null;
      notes: null;
    }) => Promise<void>;
  }) => (
    <div role="dialog">
      Event form date: {initialDate}
      <button
        type="button"
        onClick={() =>
          void onSubmit({
            title: "Dentist",
            date: initialDate,
            startTime: null,
            endTime: null,
            notes: null,
          })
        }
      >
        Submit event mock
      </button>
    </div>
  ),
}));

vi.mock("../src/lib/api", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    code = "test_error";
  },
  ...apiMocks,
}));

import { CalendarPage } from "../src/pages/CalendarPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/calendar?month=2026-07"]}>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CalendarPage month views", () => {
  beforeEach(() => {
    apiMocks.getTransactionCalendar.mockReset().mockImplementation((_, month: string) =>
      Promise.resolve({
        month,
        currency: "PHP",
        items: [],
        hasAnyTransactions: false,
      }),
    );
    apiMocks.getSubscriptions.mockReset().mockImplementation((_, month: string) =>
      Promise.resolve({
        month,
        currency: "PHP",
        totalMonthlyCostMinor: 0,
        items: [],
      }),
    );
    apiMocks.getCalendarEvents.mockReset().mockImplementation((_, month: string) =>
      Promise.resolve({
        month,
        items: [],
      }),
    );
    apiMocks.getCategories.mockReset().mockResolvedValue([]);
    apiMocks.getAccounts.mockReset().mockResolvedValue([]);
    apiMocks.createTransaction.mockReset();
    apiMocks.createCalendarEvent
      .mockReset()
      .mockImplementation((_: unknown, input: CalendarEventInput) =>
        Promise.resolve({
          id: "event-1",
          ...input,
        }),
      );
    apiMocks.updateCalendarEvent.mockReset();
    apiMocks.deleteCalendarEvent.mockReset();
  });

  afterEach(cleanup);

  it("renders the following month below a separator inside the clipped calendar surface", async () => {
    const { container } = renderPage();

    expect(await screen.findByRole("grid", { name: "Calendar for 2026-07" })).toBeVisible();
    expect(screen.getByRole("separator")).toHaveTextContent("Next month");
    expect(screen.getByRole("heading", { name: "August 2026" })).toBeVisible();
    expect(screen.getByRole("grid", { name: "Calendar for 2026-08" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Add Event" })).toBeVisible();

    const surface = container.querySelector(".calendar-surface");
    expect(surface).toContainElement(screen.getByRole("separator"));
    expect(apiMocks.getTransactionCalendar).toHaveBeenCalledWith(
      { key: "user:user-1", userId: "user-1" },
      "2026-08-01",
    );
  });

  it("selects a next-month date without navigating away from the current month", async () => {
    renderPage();
    const augustFifth = await screen.findByRole("button", { name: /August 5, 2026/i });

    fireEvent.click(augustFifth);

    await waitFor(() => expect(screen.getByText("Selected date: 2026-08-05")).toBeVisible());
    expect(
      screen.getByLabelText("Calendar month controls").querySelector("strong"),
    ).toHaveTextContent("July 2026");
    expect(screen.getByRole("grid", { name: "Calendar for 2026-07" })).toBeVisible();
    expect(screen.getByRole("grid", { name: "Calendar for 2026-08" })).toBeVisible();
    expect(screen.queryByRole("grid", { name: "Calendar for 2026-09" })).not.toBeInTheDocument();
    expect(screen.getByText(/Plan an activity for .*August 5, 2026/i)).toBeVisible();
  });

  it("opens the event form for the selected next-month date", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /August 5, 2026/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add event" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Event form date: 2026-08-05");
    expect(apiMocks.getCalendarEvents).toHaveBeenCalledWith(
      { key: "user:user-1", userId: "user-1" },
      "2026-08-01",
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit event mock" }));
    await waitFor(() =>
      expect(apiMocks.createCalendarEvent).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        {
          title: "Dentist",
          date: "2026-08-05",
          startTime: null,
          endTime: null,
          notes: null,
        },
      ),
    );
  });
});
