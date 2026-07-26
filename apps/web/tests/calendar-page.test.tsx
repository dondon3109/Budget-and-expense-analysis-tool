// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getTransactionCalendar: vi.fn(),
  getSubscriptions: vi.fn(),
  getCategories: vi.fn(),
  getAccounts: vi.fn(),
  createTransaction: vi.fn(),
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
    apiMocks.getCategories.mockReset().mockResolvedValue([]);
    apiMocks.getAccounts.mockReset().mockResolvedValue([]);
    apiMocks.createTransaction.mockReset();
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
    expect(
      screen.getByText(/Plan reminders and upcoming activities for .*August 5, 2026/i),
    ).toBeVisible();
  });
});
