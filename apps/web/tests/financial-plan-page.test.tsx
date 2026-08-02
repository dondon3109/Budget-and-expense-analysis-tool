// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { AssistantPreferences, Debt, FinancialGoal } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDebt,
  createFinancialGoal,
  deleteDebt,
  deleteFinancialGoal,
  getAssistantPreferences,
  getDebts,
  getFinancialGoals,
  updateAssistantResponsePreferences,
  updateDebt,
  updateFinancialGoal,
} from "../src/lib/api";
import { FinancialPlanPage } from "../src/pages/FinancialPlanPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/lib/api", () => ({
  createDebt: vi.fn(),
  createFinancialGoal: vi.fn(),
  deleteDebt: vi.fn(),
  deleteFinancialGoal: vi.fn(),
  getAssistantPreferences: vi.fn(),
  getDebts: vi.fn(),
  getFinancialGoals: vi.fn(),
  updateAssistantResponsePreferences: vi.fn(),
  updateDebt: vi.fn(),
  updateFinancialGoal: vi.fn(),
}));

const goal: FinancialGoal = {
  id: "goal-1",
  name: "Emergency fund",
  targetAmountMinor: 120_000_00,
  currentAmountMinor: 30_000_00,
  targetDate: "2027-08-01",
  status: "active",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const debt: Debt = {
  id: "debt-1",
  name: "Main card",
  type: "credit_card",
  balanceMinor: 45_000_00,
  aprBasisPoints: 1800,
  minimumPaymentMinor: 2_500_00,
  balanceAsOf: "2026-08-01",
  status: "active",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const preferences: AssistantPreferences = {
  consentedAt: "2026-08-02T00:00:00.000Z",
  consentVersion: 2,
  retentionDays: 90,
  assistantName: "Aster",
  userPreferredName: "Sam",
  responseDetail: "concise",
  coachingStyle: "gentle",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <FinancialPlanPage />
        </QueryClientProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("FinancialPlanPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFinancialGoals).mockResolvedValue({ items: [goal] });
    vi.mocked(getDebts).mockResolvedValue({ items: [debt] });
    vi.mocked(getAssistantPreferences).mockResolvedValue(preferences);
    vi.mocked(createFinancialGoal).mockResolvedValue(goal);
    vi.mocked(createDebt).mockResolvedValue(debt);
    vi.mocked(updateFinancialGoal).mockResolvedValue(goal);
    vi.mocked(updateDebt).mockResolvedValue(debt);
    vi.mocked(deleteFinancialGoal).mockResolvedValue(undefined);
    vi.mocked(deleteDebt).mockResolvedValue(undefined);
    vi.mocked(updateAssistantResponsePreferences).mockResolvedValue({
      ...preferences,
      responseDetail: "standard",
    });
  });

  it("renders planning totals, records, and read-only assistant trust copy", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Your planning ledger" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Emergency fund")).toBeInTheDocument();
    expect(screen.getByText("Main card")).toBeInTheDocument();
    expect(screen.getAllByText("₱30,000")).toHaveLength(2);
    expect(screen.getAllByText("₱45,000")).toHaveLength(2);
    expect(screen.getByText(/chat can never edit or delete them/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Emergency fund progress" })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
  });

  it("creates a goal with integer minor-unit amounts", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Emergency fund");

    await user.click(screen.getAllByRole("button", { name: "Add goal" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Add a goal" });
    expect(dialog).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Goal name"), "Travel fund");
    await user.type(within(dialog).getByLabelText("Target amount"), "50000.50");
    await user.clear(within(dialog).getByLabelText("Saved so far"));
    await user.type(within(dialog).getByLabelText("Saved so far"), "5000.25");
    await user.type(within(dialog).getByLabelText("Target date"), "2027-06-30");
    await user.click(within(dialog).getByRole("button", { name: "Add goal" }));

    await waitFor(() =>
      expect(createFinancialGoal).toHaveBeenCalledWith(
        { key: "user:test-user", userId: "test-user" },
        {
          name: "Travel fund",
          targetAmountMinor: 5_000_050,
          currentAmountMinor: 500_025,
          targetDate: "2027-06-30",
          status: "active",
        },
      ),
    );
  });

  it("updates response detail without changing the selected coaching tone", async () => {
    const user = userEvent.setup();
    renderPage();

    const standard = await screen.findByRole("radio", { name: /Standard/ });
    await user.click(standard);

    await waitFor(() =>
      expect(updateAssistantResponsePreferences).toHaveBeenCalledWith(
        { key: "user:test-user", userId: "test-user" },
        { responseDetail: "standard", coachingStyle: "gentle" },
      ),
    );
  });
});
