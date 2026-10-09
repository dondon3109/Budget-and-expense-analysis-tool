// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { BudgetPlan, BudgetUpsert } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCalendarEvent, getBudgetOccasions, getBudgets, saveBudgets } from "../src/lib/api";
import { BudgetsPage } from "../src/pages/BudgetsPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: mocks.signOut,
  }),
}));

vi.mock("../src/lib/api", () => ({
  getBudgets: vi.fn(),
  getBudgetOccasions: vi.fn(),
  createCalendarEvent: vi.fn(),
  getCustomerReviewState: vi.fn().mockResolvedValue({ review: {}, promptEligible: false }),
  saveBudgets: vi.fn(),
  saveCustomerReview: vi.fn(),
}));

const budgetPlan: BudgetPlan = {
  scope: "month",
  month: "2026-07-01",
  eventId: null,
  title: null,
  date: null,
  currency: "PHP",
  totalLimitMinor: 850_000,
  totalSpentMinor: 535_400,
  remainingMinor: 314_600,
  usedPercent: 63,
  items: [
    {
      categoryId: "food",
      categoryName: "Food & dining",
      categoryColor: "#dc8b3f",
      limitMinor: 850_000,
      spentMinor: 535_400,
      remainingMinor: 314_600,
      usedPercent: 63,
      source: "month",
    },
  ],
};

describe("BudgetsPage", () => {
  // Without this the renders stack up and every label query matches more than once.
  afterEach(cleanup);

  // A persisted budget draft lives in sessionStorage, which jsdom keeps for the whole file,
  // so a draft written by one test would otherwise restore into the next.
  afterEach(() => window.sessionStorage.clear());

  beforeEach(() => {
    vi.mocked(getBudgets).mockResolvedValue(budgetPlan);
    vi.mocked(saveBudgets).mockResolvedValue({ ...budgetPlan, totalLimitMinor: 900_000 });
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue(undefined);
  });

  /**
   * Renders the real page inside a route table so a shell link can prove it either
   * navigated or stayed put.
   */
  function renderBudgetRoute() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={queryClient}>
            <Routes>
              <Route path="/app/budgets" element={<BudgetsPage />} />
              <Route path="/app/transactions" element={<p>Transactions ledger</p>} />
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );
  }

  async function makeFoodBudgetDirty(user: ReturnType<typeof userEvent.setup>) {
    const amount = await screen.findByLabelText("Food & dining monthly budget");
    await user.clear(amount);
    await user.type(amount, "9000");
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
    return amount;
  }

  it("loads a plan and saves edited category limits in integer minor units", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={queryClient}>
            <BudgetsPage />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const amount = await screen.findByLabelText("Food & dining monthly budget");
    expect(amount).toHaveValue("8500.00");
    await user.clear(amount);
    await user.type(amount, "9000.00");
    await user.click(screen.getByRole("button", { name: "Save monthly plan" }));

    await waitFor(() => expect(saveBudgets).toHaveBeenCalledOnce());
    expect(vi.mocked(saveBudgets)).toHaveBeenCalledWith(
      { key: "user:test-user", userId: "test-user" },
      {
        scope: "month",
        month: "2026-07-01",
        items: [{ categoryId: "food", limitMinor: 900_000 }],
      },
    );
  });

  it("does not show unbudgeted category spending as over budget", async () => {
    vi.mocked(getBudgets).mockResolvedValue({
      ...budgetPlan,
      totalLimitMinor: 0,
      totalSpentMinor: 0,
      remainingMinor: 0,
      usedPercent: 0,
      items: [
        {
          ...budgetPlan.items[0]!,
          limitMinor: 0,
          spentMinor: 246_500,
          remainingMinor: 0,
          usedPercent: 0,
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={queryClient}>
            <BudgetsPage />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(await screen.findByText("Not budgeted")).toBeInTheDocument();
    expect(screen.queryByText("Over by")).not.toBeInTheDocument();
  });

  it("flags unsaved edits and asks the browser to confirm before an unload", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={queryClient}>
            <BudgetsPage />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const amount = await screen.findByLabelText("Food & dining monthly budget");

    // A freshly loaded plan is not dirty and must not nag on reload.
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, "9000");

    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
    const dirtyUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);
  });

  it("reads a draft the way save does, so a formatted amount is not a change", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={queryClient}>
            <BudgetsPage />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const amount = await screen.findByLabelText("Food & dining monthly budget");
    await user.clear(amount);
    await user.type(amount, "8,500.00");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();

    // parseFloat would read this as the saved 8500; save rejects it, so it is an edit.
    await user.clear(amount);
    await user.type(amount, "8500abc");
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
  });

  it("restores a draft that outlived the page, so Back or a refresh cannot lose it", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={queryClient}>
            <BudgetsPage />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const amount = await screen.findByLabelText("Food & dining monthly budget");
    await user.clear(amount);
    await user.type(amount, "9100");
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();

    // Unmount without saving, exactly as a Back-button navigation would.
    first.unmount();

    const secondClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={secondClient}>
            <BudgetsPage />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(await screen.findByLabelText("Food & dining monthly budget")).toHaveValue("9100");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("drops the persisted draft once the plan is saved", async () => {
    // A faithful fake server: the saved limits come back from the save AND from the
    // refetch that follows it. With a stale read mock the page would still be dirty after
    // saving and would rightly keep holding the draft, which is not what this test is about.
    let plan: BudgetPlan = budgetPlan;
    vi.mocked(getBudgets).mockImplementation(async () => plan);
    vi.mocked(saveBudgets).mockImplementation(async (_workspace, input: BudgetUpsert) => {
      const saved = input.items;
      plan = {
        ...budgetPlan,
        totalLimitMinor: saved.reduce((total, item) => total + item.limitMinor, 0),
        items: budgetPlan.items.map((item) => {
          const entry = saved.find((candidate) => candidate.categoryId === item.categoryId);
          const limitMinor = entry ? entry.limitMinor : item.limitMinor;
          return { ...item, limitMinor, remainingMinor: limitMinor - item.spentMinor };
        }),
      };
      return plan;
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={queryClient}>
            <BudgetsPage />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const amount = await screen.findByLabelText("Food & dining monthly budget");
    await user.clear(amount);
    await user.type(amount, "9000");
    await user.click(screen.getByRole("button", { name: "Save monthly plan" }));

    await waitFor(() => expect(saveBudgets).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
    const keys = Object.keys(window.sessionStorage).filter((key) =>
      key.startsWith("zoption-budget-draft:"),
    );
    expect(keys).toEqual([]);
  });

  it("does not treat an equivalent amount as an unsaved change", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/app/budgets?month=2026-07"]}>
          <QueryClientProvider client={queryClient}>
            <BudgetsPage />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const amount = await screen.findByLabelText("Food & dining monthly budget");
    await user.clear(amount);
    // Same value the plan already holds, written without trailing zeros.
    await user.type(amount, "8500");

    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("confirms before a sidebar link discards a dirty budget plan", async () => {
    const user = userEvent.setup();
    renderBudgetRoute();
    await makeFoodBudgetDirty(user);

    await user.click(screen.getByRole("link", { name: "Transactions" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    expect(screen.getByRole("heading", { name: "Budgets" })).toBeInTheDocument();
    expect(screen.queryByText("Transactions ledger")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Discard changes" }));

    expect(await screen.findByText("Transactions ledger")).toBeInTheDocument();
  });

  it("keeps the draft when the user chooses to keep editing", async () => {
    const user = userEvent.setup();
    renderBudgetRoute();
    const amount = await makeFoodBudgetDirty(user);

    await user.click(screen.getByRole("link", { name: "Transactions" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Transactions ledger")).not.toBeInTheDocument();
    expect(amount).toHaveValue("9000");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("warns before signing out with unsaved budget edits", async () => {
    const user = userEvent.setup();
    renderBudgetRoute();
    await makeFoodBudgetDirty(user);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Discard and sign out" }));

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("navigates straight away when the plan has no unsaved edits", async () => {
    const user = userEvent.setup();
    renderBudgetRoute();
    await screen.findByLabelText("Food & dining monthly budget");

    await user.click(screen.getByRole("link", { name: "Transactions" }));

    expect(await screen.findByText("Transactions ledger")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirms before a month change discards a dirty budget plan", async () => {
    const user = userEvent.setup();
    // The real API answers for the requested month, which is what re-seeds the drafts.
    vi.mocked(getBudgets).mockImplementation((_workspace, query) =>
      Promise.resolve({ ...budgetPlan, month: query.scope === "month" ? query.month : null }),
    );
    renderBudgetRoute();
    await makeFoodBudgetDirty(user);

    await user.click(screen.getByRole("button", { name: "Budget month: July 2026" }));
    await user.click(screen.getByRole("button", { name: "August 2026" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    // Nothing has switched yet: same month, same draft.
    expect(screen.getByRole("button", { name: "Budget month: July 2026" })).toBeInTheDocument();
    expect(screen.getByLabelText("Food & dining monthly budget")).toHaveValue("9000");

    await user.click(within(dialog).getByRole("button", { name: "Discard changes" }));

    expect(
      await screen.findByRole("button", { name: "Budget month: August 2026" }),
    ).toBeInTheDocument();
    // The newly loaded plan re-seeds the drafts and the page is clean again.
    expect(await screen.findByLabelText("Food & dining monthly budget")).toHaveValue("8500.00");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("keeps the month and the draft when the user chooses to keep editing", async () => {
    const user = userEvent.setup();
    renderBudgetRoute();
    await makeFoodBudgetDirty(user);

    const monthTrigger = screen.getByRole("button", { name: "Budget month: July 2026" });
    await user.click(monthTrigger);
    await user.click(screen.getByRole("button", { name: "August 2026" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Budget month: July 2026" })).toBe(monthTrigger);
    expect(screen.getByLabelText("Food & dining monthly budget")).toHaveValue("9000");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    // Focus comes back to the control that asked the question.
    expect(monthTrigger).toHaveFocus();
  });

  it("switches the month immediately when the plan has no unsaved edits", async () => {
    const user = userEvent.setup();
    renderBudgetRoute();
    await screen.findByLabelText("Food & dining monthly budget");

    await user.click(screen.getByRole("button", { name: "Budget month: July 2026" }));
    await user.click(screen.getByRole("button", { name: "August 2026" }));

    expect(
      await screen.findByRole("button", { name: "Budget month: August 2026" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  describe("scopes", () => {
    function renderAt(path: string) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return render(
        <ThemeProvider>
          <MemoryRouter initialEntries={[path]}>
            <QueryClientProvider client={queryClient}>
              <BudgetsPage />
            </QueryClientProvider>
          </MemoryRouter>
        </ThemeProvider>,
      );
    }

    it("saves only the limits that changed, so a month keeps inheriting the rest", async () => {
      const user = userEvent.setup();
      vi.mocked(getBudgets).mockResolvedValue({
        ...budgetPlan,
        totalLimitMinor: 850_000 + 30_000,
        items: [
          ...budgetPlan.items,
          {
            ...budgetPlan.items[0]!,
            categoryId: "fun",
            categoryName: "Fun",
            limitMinor: 30_000,
            spentMinor: 0,
            remainingMinor: 30_000,
            usedPercent: 0,
            source: "every-month",
          },
        ],
      });
      renderAt("/app/budgets?month=2026-07");

      const food = await screen.findByLabelText("Food & dining monthly budget");
      expect(screen.getByText(/· Every month/)).toBeInTheDocument();
      await user.clear(food);
      await user.type(food, "9000");
      await user.click(screen.getByRole("button", { name: "Save monthly plan" }));

      await waitFor(() => expect(saveBudgets).toHaveBeenCalledOnce());
      expect(vi.mocked(saveBudgets).mock.calls[0]![1]).toEqual({
        scope: "month",
        month: "2026-07-01",
        items: [{ categoryId: "food", limitMinor: 900_000 }],
      });
    });

    it("edits the every-month defaults on their own tab", async () => {
      const user = userEvent.setup();
      vi.mocked(getBudgets).mockResolvedValue({
        ...budgetPlan,
        scope: "every-month",
        month: null,
        items: [{ ...budgetPlan.items[0]!, source: "every-month" }],
      });
      renderAt("/app/budgets?month=2026-07&scope=every-month");

      const food = await screen.findByLabelText("Food & dining every-month budget");
      expect(vi.mocked(getBudgets).mock.calls[0]![1]).toEqual({ scope: "every-month" });
      await user.clear(food);
      await user.type(food, "7000");
      await user.click(screen.getByRole("button", { name: "Save every-month plan" }));

      await waitFor(() => expect(saveBudgets).toHaveBeenCalledOnce());
      expect(vi.mocked(saveBudgets).mock.calls[0]![1]).toEqual({
        scope: "every-month",
        items: [{ categoryId: "food", limitMinor: 700_000 }],
      });
    });

    it("lists a month's occasions and opens one to edit its limits", async () => {
      const user = userEvent.setup();
      vi.mocked(getBudgetOccasions).mockResolvedValue({
        occasions: [
          {
            eventId: "party",
            title: "Mia birthday",
            date: "2026-07-15",
            totalLimitMinor: 80_000,
            totalSpentMinor: 50_000,
          },
        ],
      });
      vi.mocked(getBudgets).mockResolvedValue({
        ...budgetPlan,
        scope: "occasion",
        month: null,
        eventId: "party",
        title: "Mia birthday",
        date: "2026-07-15",
        items: [{ ...budgetPlan.items[0]!, source: "occasion" }],
      });
      renderAt("/app/budgets?month=2026-07&scope=occasions");

      await user.click(await screen.findByRole("button", { name: /Mia birthday/ }));

      expect(await screen.findByLabelText("Food & dining occasion budget")).toBeInTheDocument();
      expect(vi.mocked(getBudgets).mock.calls.at(-1)![1]).toEqual({
        scope: "occasion",
        eventId: "party",
      });
      expect(screen.getByRole("button", { name: "Save occasion budget" })).toBeInTheDocument();
    });

    it("starts an occasion as a calendar event", async () => {
      const user = userEvent.setup();
      vi.mocked(getBudgetOccasions).mockResolvedValue({ occasions: [] });
      vi.mocked(createCalendarEvent).mockResolvedValue({ id: "party" } as never);
      vi.mocked(getBudgets).mockResolvedValue({
        ...budgetPlan,
        scope: "occasion",
        month: null,
        eventId: "party",
        title: "Mia's party",
      });
      renderAt("/app/budgets?month=2026-07&scope=occasions");

      await user.type(await screen.findByLabelText("Occasion"), "Mia's party");
      await user.click(screen.getByRole("button", { name: "New occasion" }));

      await waitFor(() => expect(createCalendarEvent).toHaveBeenCalledOnce());
      expect(vi.mocked(createCalendarEvent).mock.calls[0]![1]).toEqual({
        title: "Mia's party",
        date: "2026-07-01",
      });
      expect(
        await screen.findByRole("button", { name: "Save occasion budget" }),
      ).toBeInTheDocument();
    });
  });
});
