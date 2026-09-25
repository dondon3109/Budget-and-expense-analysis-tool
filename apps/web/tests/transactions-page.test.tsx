// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  TransactionTable: ({
    items,
    onEdit,
  }: {
    items: { id: string }[];
    onEdit: (item: { id: string }) => void;
  }) => (
    <button type="button" onClick={() => onEdit(items[0]!)}>
      Edit first transaction
    </button>
  ),
}));

vi.mock("../src/components/transactions/TransactionForm", () => ({
  TransactionForm: ({ onSubmit }: { onSubmit: (input: unknown) => Promise<void> }) => (
    <div role="dialog" aria-label="Transaction form">
      <button type="button" onClick={() => void onSubmit({ kind: "income" })}>
        Submit transaction
      </button>
    </div>
  ),
}));

vi.mock("../src/components/transactions/CategoryManager", () => ({
  CategoryManager: () => null,
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...apiMocks,
}));

import { ApiRequestError } from "../src/lib/api";
import { TransactionsPage } from "../src/pages/TransactionsPage";

function renderPage(initialEntry = "/app/transactions") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
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

  it("opens the transaction form from the dashboard header link", () => {
    renderPage("/app/transactions?add=1");

    expect(screen.getByRole("dialog", { name: "Transaction form" })).toBeInTheDocument();
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

  it("offers Plan and billing when transaction export requires Pro", async () => {
    apiMocks.downloadTransactions.mockRejectedValueOnce(
      new ApiRequestError("Zoption Pro is required.", 403, "upgrade_required", {
        capability: "transaction_export",
      }),
    );
    renderPage();
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByRole("alert", { name: "Zoption Pro is required" })).toHaveTextContent(
      "transaction exports",
    );
    expect(screen.getByText("0 transactions")).toBeInTheDocument();
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

describe("TransactionsPage loading state", () => {
  beforeEach(() => {
    // Never settles, so the pending branch stays on screen for the assertions.
    apiMocks.getTransactions.mockReset().mockImplementation(() => new Promise(() => {}));
    apiMocks.getCategories.mockReset().mockResolvedValue([]);
    apiMocks.getAccounts.mockReset().mockResolvedValue([]);
    apiMocks.downloadTransactions.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("renders skeleton table rows and keeps the loading state announced", () => {
    renderPage();

    const status = screen.getByRole("status", { name: "Loading transaction records" });
    expect(status).toBeInTheDocument();
    // Selection, Date, Description, Category, Type, Amount, row actions.
    expect(status.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(status.querySelectorAll("tbody td")).toHaveLength(42);
    expect(screen.queryByText("Loading transaction records…")).not.toBeInTheDocument();
  });
});

describe("TransactionsPage continuous ledger", () => {
  beforeEach(() => {
    apiMocks.getCategories.mockReset().mockResolvedValue([]);
    apiMocks.getAccounts.mockReset().mockResolvedValue([]);
    apiMocks.downloadTransactions.mockReset().mockResolvedValue(undefined);
    apiMocks.getTransactions
      .mockReset()
      .mockImplementation(
        async (_workspace: unknown, request: { page: number; pageSize: number }) => ({
          items: Array.from({ length: request.page < 3 ? 50 : 20 }, (_, index) => ({
            id: `transaction-${(request.page - 1) * 50 + index + 1}`,
            description: `Transaction ${(request.page - 1) * 50 + index + 1}`,
          })),
          page: request.page,
          pageSize: request.pageSize,
          total: 120,
          totalPages: 3,
        }),
      );
  });

  afterEach(cleanup);

  it("appends the next page instead of replacing the list", async () => {
    renderPage();

    expect(await screen.findByText("Showing 50 of 120")).toHaveAttribute("role", "status");
    expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
      { key: "user:user-1", userId: "user-1" },
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 100 of 120")).toBeInTheDocument();
    expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
      { key: "user:user-1", userId: "user-1" },
      expect.objectContaining({ page: 2 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 120 of 120")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("announces the position from a single live region", async () => {
    renderPage();

    const status = await screen.findByText("Showing 50 of 120");
    const panel = status.closest(".transactions-panel");

    expect(panel).not.toBeNull();
    // The panel itself must stay non-live or the position would be announced twice.
    expect(panel).not.toHaveAttribute("aria-live");
    expect(panel!.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(1);
  });

  it("does not re-announce the position on every keystroke", async () => {
    renderPage();

    const status = await screen.findByText("Showing 50 of 120");
    const search = screen.getByRole("searchbox");

    fireEvent.change(search, { target: { value: "m" } });
    fireEvent.change(search, { target: { value: "ma" } });

    // The same node keeps the same text until the settled query returns a new list.
    expect(screen.getByText("Showing 50 of 120")).toBe(status);
  });

  it("hands the announcement to the empty state when nothing matches", async () => {
    apiMocks.getTransactions.mockReset().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 1,
    });
    renderPage();

    const message = await screen.findByText("No transactions match these filters.");
    expect(message).toHaveAttribute("role", "status");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("TransactionsPage editing", () => {
  const existing = {
    id: "transaction-1",
    kind: "expense",
    description: "Groceries",
    amountMinor: -1000,
    currency: "PHP",
    date: "2026-09-01",
    createdAt: "2026-09-01T00:00:00.000Z",
  };

  beforeEach(() => {
    apiMocks.getTransactions.mockReset().mockResolvedValue({
      items: [existing],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    apiMocks.getCategories.mockReset().mockResolvedValue([]);
    apiMocks.getAccounts.mockReset().mockResolvedValue([]);
    apiMocks.createTransaction.mockReset();
    apiMocks.updateTransaction.mockReset().mockResolvedValue({ ...existing, kind: "income" });
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    cleanup();
  });

  it("updates the edited transaction instead of creating a new one when its type changes", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit first transaction" }));
    // Holding the save until the page re-renders without the edit target is the window in
    // which a closure over `editing` used to turn the edit into a create.
    onlineManager.setOnline(false);
    fireEvent.click(screen.getByRole("button", { name: "Submit transaction" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Transaction form" })).not.toBeInTheDocument(),
    );
    act(() => onlineManager.setOnline(true));

    await waitFor(() =>
      expect(apiMocks.updateTransaction).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        { id: "transaction-1", input: { kind: "income" } },
      ),
    );
    expect(apiMocks.createTransaction).not.toHaveBeenCalled();
  });
});
