// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AccountBalanceSummaryItem, CategoryRecord } from "@zoption/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getCategories: vi.fn(),
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...apiMocks,
}));

import { AdjustBalanceModal } from "../src/components/account/AdjustBalanceModal";

describe("AdjustBalanceModal", () => {
  let queryClient: QueryClient;

  const mockAccount: AccountBalanceSummaryItem = {
    id: "acc-cash",
    name: "Cash",
    type: "cash",
    currency: "PHP",
    balanceMinor: 10_000, // ₱100.00
    balancesByCurrency: { PHP: 10_000, USD: 0 },
    archived: false,
    system: true,
  };

  const mockCategories: CategoryRecord[] = [
    {
      id: "cat-uncat-inc",
      name: "Uncategorized",
      kind: "income",
      color: "#10b981",
      archived: false,
      system: true,
      origin: "system",
      requiredPlan: "free",
      locked: true,
    },
    {
      id: "cat-uncat-exp",
      name: "Uncategorized",
      kind: "expense",
      color: "#ef4444",
      archived: false,
      system: true,
      origin: "system",
      requiredPlan: "free",
      locked: true,
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    apiMocks.getCategories.mockResolvedValue(mockCategories);
    apiMocks.createTransaction.mockResolvedValue({ id: "tx-adjust-1" });
    apiMocks.deleteTransaction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  function renderModal(props = {}) {
    return render(
      <QueryClientProvider client={queryClient}>
        <AdjustBalanceModal account={mockAccount} onClose={vi.fn()} {...props} />
      </QueryClientProvider>,
    );
  }

  it("renders account details and current balance", async () => {
    renderModal();

    expect(screen.getByRole("heading", { name: "Adjust current balance" })).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("₱100")).toBeInTheDocument();
  });

  it("computes preview delta when a new balance is entered", async () => {
    renderModal();

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "150.00" } });

    expect(await screen.findByText("+₱50")).toBeInTheDocument();
    expect(screen.getByText("booked as income adjustment")).toBeInTheDocument();
  });

  it("creates an adjustment transaction and allows undo", async () => {
    renderModal();

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "150.00" } });

    const submitButton = screen.getByRole("button", { name: "Save adjustment" });
    expect(submitButton).not.toBeDisabled();
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(apiMocks.createTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: "income",
          accountId: "acc-cash",
          amountMinor: 5000,
          description: "Balance adjustment for Cash",
        }),
      );
    });

    expect(await screen.findByText("Adjustment booked successfully!")).toBeInTheDocument();

    const undoButton = screen.getByRole("button", { name: /Undo adjustment/i });
    fireEvent.click(undoButton);

    await waitFor(() => {
      expect(apiMocks.deleteTransaction).toHaveBeenCalledWith(expect.anything(), "tx-adjust-1");
    });
  });
});
