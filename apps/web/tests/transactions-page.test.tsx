// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getTransactions: vi.fn(),
  getCategories: vi.fn(),
  getAccounts: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  downloadTransactions: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/components/transactions/TransactionTable", () => ({
  TransactionTable: () => <div>Transaction table</div>,
}));

vi.mock("../src/components/transactions/TransactionForm", () => ({
  TransactionForm: () => null,
}));

vi.mock("../src/components/transactions/CategoryManager", () => ({
  CategoryManager: () => null,
}));

vi.mock("../src/lib/api", () => apiMocks);

import { TransactionsPage } from "../src/pages/TransactionsPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TransactionsPage search", () => {
  beforeEach(() => {
    apiMocks.getTransactions.mockReset().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    });
    apiMocks.getCategories.mockReset().mockResolvedValue([]);
    apiMocks.getAccounts.mockReset().mockResolvedValue([]);
    apiMocks.createTransaction.mockReset();
    apiMocks.updateTransaction.mockReset();
    apiMocks.deleteTransaction.mockReset();
    apiMocks.downloadTransactions.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("applies a settled search after 300 ms and clears it with the filters", async () => {
    renderPage();
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  market  " } });
    await act(() => vi.advanceTimersByTime(299));
    expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTime(1));
    expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
      { key: "user:user-1", userId: "user-1" },
      expect.objectContaining({ page: 1, search: "market" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
      { key: "user:user-1", userId: "user-1" },
      expect.not.objectContaining({ search: "market" }),
    );
  });

  it("applies Enter immediately instead of waiting for the debounce", async () => {
    renderPage();
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();

    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "Food" } });
    fireEvent.submit(search.closest("form")!);

    expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
      { key: "user:user-1", userId: "user-1" },
      expect.objectContaining({ search: "Food" }),
    );
    await act(() => vi.advanceTimersByTime(300));
    expect(apiMocks.getTransactions).toHaveBeenCalledTimes(2);
  });
});

describe("TransactionsPage sorting", () => {
  beforeEach(() => {
    apiMocks.getTransactions.mockReset().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    });
    apiMocks.getCategories.mockReset().mockResolvedValue([]);
    apiMocks.getAccounts.mockReset().mockResolvedValue([]);
    apiMocks.downloadTransactions.mockReset().mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  afterEach(cleanup);

  it("updates, saves, and exports the selected sort", async () => {
    renderPage();
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "amount-asc" } });

    await waitFor(() =>
      expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
        { key: "user:user-1", userId: "user-1" },
        expect.objectContaining({ page: 1, sortBy: "amount", sortDirection: "asc" }),
      ),
    );
    expect(window.localStorage.getItem("zoption-transaction-sort")).toBe(
      JSON.stringify({ sortBy: "amount", sortDirection: "asc" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() =>
      expect(apiMocks.downloadTransactions).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        expect.objectContaining({ sortBy: "amount", sortDirection: "asc" }),
      ),
    );
  });

  it("keeps the selected sort when clearing filters", async () => {
    renderPage();
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "description-asc" } });
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Market" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() =>
      expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
        { key: "user:user-1", userId: "user-1" },
        expect.objectContaining({ sortBy: "description", sortDirection: "asc" }),
      ),
    );
  });
});
