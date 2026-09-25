// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord, TransactionInput, TransactionListItem } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspace = { key: "user:user-1" as const, userId: "user-1" };

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

vi.mock("../src/components/transactions/TransactionForm", () => ({
  TransactionForm: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Transaction form">
      <button type="button" onClick={onClose}>
        Close form
      </button>
    </div>
  ),
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...apiMocks,
}));

import { TransactionsPage } from "../src/pages/TransactionsPage";

const categories: CategoryRecord[] = [
  {
    id: "cat-food",
    name: "Food",
    kind: "expense",
    color: "#dc8b3f",
    archived: false,
    system: false,
    origin: "custom",
    requiredPlan: "free",
    locked: false,
  },
  {
    id: "cat-salary",
    name: "Salary",
    kind: "income",
    color: "#008300",
    archived: false,
    system: false,
    origin: "starter",
    requiredPlan: "free",
    locked: false,
  },
];

const groceries: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-29",
  description: "Groceries",
  amountMinor: -12500,
  currency: "PHP",
  kind: "expense",
  categoryId: "cat-food",
  categoryName: "Food",
  categoryColor: "#dc8b3f",
  categoryIconEmoji: null,
  accountId: "acct-1",
  accountName: "Cash",
  notes: null,
};

const salary: TransactionListItem = {
  id: "transaction-2",
  date: "2026-07-28",
  description: "Salary",
  amountMinor: 500_000,
  currency: "PHP",
  kind: "income",
  categoryId: "cat-salary",
  categoryName: "Salary",
  categoryColor: "#008300",
  categoryIconEmoji: null,
  accountId: "acct-1",
  accountName: "Cash",
  notes: null,
};

let rows: TransactionListItem[] = [];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderPage(initialEntry = "/app/transactions") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <TransactionsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function locationSearch(): string {
  return screen.getByTestId("location").textContent ?? "";
}

beforeEach(() => {
  rows = [groceries, salary];
  window.localStorage.clear();
  apiMocks.getTransactions.mockReset().mockImplementation(async () => ({
    items: [...rows],
    page: 1,
    pageSize: 10,
    total: rows.length,
    totalPages: 1,
  }));
  apiMocks.getCategories.mockReset().mockResolvedValue(categories);
  apiMocks.getAccounts.mockReset().mockResolvedValue([]);
  apiMocks.downloadTransactions.mockReset().mockResolvedValue(undefined);
  apiMocks.deleteTransaction.mockReset().mockImplementation(async (_ws, id: string) => {
    rows = rows.filter((row) => row.id !== id);
  });
  apiMocks.createTransaction
    .mockReset()
    .mockImplementation(async (_ws, input: TransactionInput) => {
      const created: TransactionListItem = {
        ...groceries,
        ...input,
        id: `created-${rows.length + 1}`,
        description: input.description ?? "Transfer",
        categoryName:
          categories.find((category) => category.id === input.categoryId)?.name ?? "Category",
        accountId: "accountId" in input ? input.accountId : null,
        notes: input.notes ?? null,
      };
      rows = [created, ...rows];
      return created;
    });
  apiMocks.updateTransaction
    .mockReset()
    .mockImplementation(async (_ws, args: { id: string; input: { categoryId?: string } }) => {
      const category = categories.find((candidate) => candidate.id === args.input.categoryId);
      rows = rows.map((row) =>
        row.id === args.id && category
          ? { ...row, categoryId: category.id, categoryName: category.name }
          : row,
      );
      return rows.find((row) => row.id === args.id)!;
    });
});

afterEach(cleanup);

describe("TransactionsPage URL-backed filters", () => {
  it("applies the filter set from the URL on load", async () => {
    renderPage("/app/transactions?search=market&kind=expense&from=2026-07-01&to=2026-07-31");

    await waitFor(() =>
      expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
        workspace,
        expect.objectContaining({
          search: "market",
          kind: "expense",
          from: "2026-07-01",
          to: "2026-07-31",
          page: 1,
        }),
      ),
    );
    expect(screen.getByRole("searchbox")).toHaveValue("market");
  });

  it("writes a filter change to the URL and round-trips it into a fresh load", async () => {
    renderPage();
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Filter by transaction type"), {
      target: { value: "income" },
    });

    await waitFor(() => expect(locationSearch()).toContain("kind=income"));
    await waitFor(() =>
      expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
        workspace,
        expect.objectContaining({ kind: "income", page: 1 }),
      ),
    );

    const reloaded = locationSearch();
    cleanup();
    apiMocks.getTransactions.mockClear();
    renderPage(`/app/transactions${reloaded}`);

    await waitFor(() =>
      expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
        workspace,
        expect.objectContaining({ kind: "income" }),
      ),
    );
    expect(screen.getByLabelText("Filter by transaction type")).toHaveValue("income");
  });

  it("clears the filter params when the filters are cleared", async () => {
    renderPage("/app/transactions?search=market&kind=expense");
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(locationSearch()).not.toContain("kind="));
    expect(locationSearch()).not.toContain("search=");
    expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
      workspace,
      expect.not.objectContaining({ search: "market" }),
    );
  });

  it("applies a date preset to the query and the URL", async () => {
    renderPage();
    await waitFor(() => expect(apiMocks.getTransactions).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Year to date" }));

    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    await waitFor(() =>
      expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
        workspace,
        expect.objectContaining({ from: `${todayIso.slice(0, 4)}-01-01`, to: todayIso }),
      ),
    );
    await waitFor(() => expect(locationSearch()).toContain("from="));
  });
});

describe("TransactionsPage delete confirmation and undo", () => {
  it("confirms with a danger action naming the row, then undoes the delete", async () => {
    renderPage();
    await screen.findByText("Groceries");

    fireEvent.click(screen.getByRole("button", { name: "Delete Groceries" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Delete this transaction?" });
    expect(dialog).toHaveTextContent("“Groceries”");
    expect(dialog).toHaveTextContent("will be removed from your ledger");
    const confirm = within(dialog).getByRole("button", { name: "Delete transaction" });
    expect(confirm).toHaveClass("danger");

    fireEvent.click(confirm);

    await waitFor(() =>
      expect(apiMocks.deleteTransaction).toHaveBeenCalledWith(workspace, "transaction-1"),
    );
    await waitFor(() => expect(screen.queryByText("Groceries")).not.toBeInTheDocument());

    const undo = await screen.findByRole("button", { name: "Undo" });
    expect(document.activeElement).toBe(undo);

    fireEvent.click(undo);

    await waitFor(() =>
      expect(apiMocks.createTransaction).toHaveBeenCalledWith(
        workspace,
        expect.objectContaining({
          kind: "expense",
          description: "Groceries",
          amountMinor: 12500,
          accountId: "acct-1",
          categoryId: "cat-food",
        }),
      ),
    );
    expect(await screen.findByText("Groceries")).toBeInTheDocument();
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    renderPage();
    await screen.findByText("Groceries");

    fireEvent.click(screen.getByRole("button", { name: "Delete Salary" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete this transaction?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(apiMocks.deleteTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit Salary" })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete Salary" }));
  });
});

describe("TransactionsPage bulk actions", () => {
  it("selects rows and changes their category in one action", async () => {
    apiMocks.updateTransaction.mockImplementation(
      async (_ws, args: { id: string; input: { categoryId?: string } }) => {
        const category = categories.find((candidate) => candidate.id === args.input.categoryId);
        rows = rows.map((row) =>
          row.id === args.id && category
            ? { ...row, categoryId: category.id, categoryName: category.name }
            : row,
        );
        return rows.find((row) => row.id === args.id)!;
      },
    );
    renderPage();
    await screen.findByText("Groceries");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Groceries" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Salary" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Change category to"), {
      target: { value: "cat-salary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change category" }));

    await waitFor(() =>
      expect(apiMocks.updateTransaction).toHaveBeenCalledWith(workspace, {
        id: "transaction-1",
        input: { categoryId: "cat-salary" },
      }),
    );
    expect(apiMocks.updateTransaction).toHaveBeenCalledWith(workspace, {
      id: "transaction-2",
      input: { categoryId: "cat-salary" },
    });
    await waitFor(() => expect(screen.queryByText("2 selected")).not.toBeInTheDocument());
  });

  it("selects the whole page and bulk deletes after confirmation", async () => {
    renderPage();
    await screen.findByText("Groceries");

    const selectAll = screen.getByRole("checkbox", {
      name: "Select all loaded transactions",
    }) as HTMLInputElement;
    fireEvent.click(selectAll);
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete 2 transactions?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete 2 transactions" }));

    await waitFor(() => expect(apiMocks.deleteTransaction).toHaveBeenCalledTimes(2));
    expect(apiMocks.deleteTransaction).toHaveBeenCalledWith(workspace, "transaction-1");
    expect(apiMocks.deleteTransaction).toHaveBeenCalledWith(workspace, "transaction-2");
    await waitFor(() => expect(screen.queryByText("2 transactions deleted.")).toBeInTheDocument());
  });

  it("clears the selection when the filters change", async () => {
    renderPage();
    await screen.findByText("Groceries");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Groceries" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter by transaction type"), {
      target: { value: "income" },
    });

    await waitFor(() => expect(screen.queryByText("1 selected")).not.toBeInTheDocument());
  });
});

describe("TransactionsPage shortcuts", () => {
  it("ignores bare shortcuts while a field has focus", async () => {
    renderPage();
    await screen.findByText("Groceries");

    const search = screen.getByRole("searchbox");
    search.focus();
    fireEvent.keyDown(search, { key: "n" });
    expect(screen.queryByRole("dialog", { name: "Transaction form" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Groceries" }));
    const bulkSelect = screen.getByLabelText("Change category to");
    bulkSelect.focus();
    fireEvent.keyDown(bulkSelect, { key: "n" });
    expect(screen.queryByRole("dialog", { name: "Transaction form" })).not.toBeInTheDocument();
  });

  it('opens a new transaction with "n" and focuses search with "/"', async () => {
    renderPage();
    await screen.findByText("Groceries");

    fireEvent.keyDown(document.body, { key: "n" });
    expect(await screen.findByRole("dialog", { name: "Transaction form" })).toBeInTheDocument();
  });

  it('focuses the search field with "/"', async () => {
    renderPage();
    await screen.findByText("Groceries");

    fireEvent.keyDown(document.body, { key: "/" });

    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });
});

describe("TransactionsPage ledger row navigation", () => {
  function rows() {
    return Array.from(
      screen.getByRole("table", { name: "Transactions" }).querySelectorAll("tr[data-ledger-row]"),
    );
  }

  it("moves focus down and up the ledger rows with j and k", async () => {
    renderPage();
    await screen.findByText("Groceries");
    const [first, second] = rows();

    fireEvent.keyDown(document.body, { key: "j" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document.body, { key: "j" });
    expect(document.activeElement).toBe(second);

    // The ends of the list are floors, not wrap-arounds.
    fireEvent.keyDown(document.body, { key: "j" });
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(document.body, { key: "k" });
    expect(document.activeElement).toBe(first);
  });

  it("ignores j and k while a field has focus", async () => {
    renderPage();
    await screen.findByText("Groceries");
    const [first] = rows();

    const search = screen.getByRole("searchbox");
    search.focus();
    fireEvent.keyDown(search, { key: "j" });
    expect(document.activeElement).toBe(search);

    // Focus starts at the top when no row holds it yet.
    fireEvent.keyDown(document.body, { key: "k" });
    expect(document.activeElement).toBe(first);
  });

  it("ignores j and k while a dialog is open", async () => {
    renderPage();
    await screen.findByText("Groceries");

    fireEvent.keyDown(document.body, { key: "n" });
    await screen.findByRole("dialog", { name: "Transaction form" });

    fireEvent.keyDown(document.body, { key: "j" });

    expect(document.activeElement).toBe(document.body);
  });
});

describe("TransactionsPage saved views", () => {
  it("round-trips a saved filter set through localStorage and the URL", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Save view" });

    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "market" } });
    fireEvent.submit(search.closest("form")!);
    await waitFor(() => expect(locationSearch()).toContain("search=market"));

    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Market runs" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const stored = JSON.parse(
      window.localStorage.getItem("zoption-transaction-views") ?? "[]",
    ) as Array<{ id: string; name: string; filters: { search?: string } }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: "Market runs", filters: { search: "market" } });
    expect(screen.queryByLabelText("View name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(locationSearch()).not.toContain("search="));

    fireEvent.change(screen.getByLabelText("Views"), { target: { value: stored[0]!.id } });

    await waitFor(() => expect(locationSearch()).toContain("search=market"));
    expect(screen.getByRole("searchbox")).toHaveValue("market");
    expect(apiMocks.getTransactions).toHaveBeenLastCalledWith(
      workspace,
      expect.objectContaining({ search: "market", page: 1 }),
    );

    // A fresh mount reads the saved view back out of storage.
    cleanup();
    renderPage();
    expect(await screen.findByRole("option", { name: "Market runs" })).toBeInTheDocument();
  });

  it("deletes a saved view without touching the applied filters", async () => {
    window.localStorage.setItem(
      "zoption-transaction-views",
      JSON.stringify([{ id: "view-1", name: "Food only", filters: { categoryId: "cat-food" } }]),
    );
    renderPage();
    await screen.findByText("Groceries");

    fireEvent.change(screen.getByLabelText("Views"), { target: { value: "view-1" } });
    await waitFor(() => expect(locationSearch()).toContain("category=cat-food"));

    fireEvent.click(screen.getByRole("button", { name: "Delete view Food only" }));

    expect(screen.queryByRole("option", { name: "Food only" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("zoption-transaction-views")).toBe("[]");
    expect(locationSearch()).toContain("category=cat-food");
  });
});
