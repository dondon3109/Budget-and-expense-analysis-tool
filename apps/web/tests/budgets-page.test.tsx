// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { BudgetMonthPlan } from "@budget/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBudgets, saveBudgets } from "../src/lib/api";
import { BudgetsPage } from "../src/pages/BudgetsPage";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/lib/api", () => ({
  getBudgets: vi.fn(),
  saveBudgets: vi.fn(),
}));

const budgetPlan: BudgetMonthPlan = {
  month: "2026-07-01",
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
    },
  ],
};

describe("BudgetsPage", () => {
  beforeEach(() => {
    vi.mocked(getBudgets).mockResolvedValue(budgetPlan);
    vi.mocked(saveBudgets).mockResolvedValue({ ...budgetPlan, totalLimitMinor: 900_000 });
  });

  it("loads a plan and saves edited category limits in integer minor units", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <BudgetsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const amount = await screen.findByLabelText("Food & dining monthly budget");
    expect(amount).toHaveValue("8500.00");
    await user.clear(amount);
    await user.type(amount, "9000.00");
    await user.click(screen.getByRole("button", { name: "Save monthly plan" }));

    await waitFor(() => expect(saveBudgets).toHaveBeenCalledOnce());
    expect(vi.mocked(saveBudgets)).toHaveBeenCalledWith(
      { mode: "user", key: "user:test-user", userId: "test-user" },
      {
        month: "2026-07-01",
        items: [{ categoryId: "food", limitMinor: 900_000 }],
      },
    );
  });
});
