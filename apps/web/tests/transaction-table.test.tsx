// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { TransactionListItem } from "@zoption/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionTable } from "../src/components/transactions/TransactionTable";

const item: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-29",
  description: "Groceries",
  amountMinor: -12500,
  currency: "PHP" as const,
  kind: "expense" as const,
  categoryId: "category-1",
  categoryName: "Food",
  categoryColor: "#008000",
  accountId: "account-1",
  accountName: "Cash",
  notes: null,
};

const incomeItem: TransactionListItem = {
  ...item,
  id: "transaction-2",
  description: "Salary",
  amountMinor: 500_000,
  kind: "income",
};

function renderTable(
  options: {
    sortBy?: "date" | "description" | "amount";
    sortDirection?: "asc" | "desc";
    items?: TransactionListItem[];
    selectedIds?: ReadonlySet<string>;
  } = {},
) {
  const onSort = vi.fn();
  const onToggleSelect = vi.fn();
  const onToggleSelectAll = vi.fn();
  const onRequestDelete = vi.fn();
  render(
    <TransactionTable
      items={options.items ?? [item]}
      sortBy={options.sortBy ?? "date"}
      sortDirection={options.sortDirection ?? "desc"}
      selectedIds={options.selectedIds ?? new Set<string>()}
      onSort={onSort}
      onEdit={vi.fn()}
      onRequestDelete={onRequestDelete}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
    />,
  );
  return { onSort, onToggleSelect, onToggleSelectAll, onRequestDelete };
}

afterEach(cleanup);

describe("TransactionTable sorting", () => {
  it("exposes the active sort direction", () => {
    renderTable({ sortBy: "amount", sortDirection: "asc" });

    expect(screen.getByRole("columnheader", { name: /amount/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByRole("columnheader", { name: /date/i })).not.toHaveAttribute("aria-sort");
  });

  it("sends the selected sortable field to the page", () => {
    const { onSort } = renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Sort by description" }));

    expect(onSort).toHaveBeenCalledWith("description");
  });

  it("labels every column header and captions the table", () => {
    renderTable();

    const table = screen.getByRole("table", { name: "Transactions" });
    expect(table.querySelector("caption")).toHaveTextContent("Transactions");
    for (const header of screen.getAllByRole("columnheader")) {
      expect(header).toHaveAttribute("scope", "col");
    }
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  });

  it("prints a singular type badge", () => {
    renderTable();

    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.queryByText("Expenses")).not.toBeInTheDocument();
  });
});

describe("TransactionTable keyboard navigation", () => {
  it("makes body rows programmatically focusable without adding tab stops", () => {
    renderTable({ items: [item, incomeItem] });

    const rows = screen.getByRole("table", { name: "Transactions" }).querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveAttribute("tabindex", "-1");
    }
  });
});

describe("TransactionTable selection", () => {
  it("names row checkboxes after the row and reports toggles", () => {
    const { onToggleSelect } = renderTable({ items: [item, incomeItem] });

    expect(
      screen.getByRole("checkbox", { name: "Select all transactions on this page" }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Groceries" }));
    expect(onToggleSelect).toHaveBeenCalledWith("transaction-1");
  });

  it("reflects the page selection and the indeterminate state", () => {
    renderTable({ items: [item, incomeItem], selectedIds: new Set(["transaction-1"]) });

    expect(screen.getByRole("checkbox", { name: "Select Groceries" })).toBeChecked();
    const selectAll = screen.getByRole("checkbox", {
      name: "Select all transactions on this page",
    }) as HTMLInputElement;
    expect(selectAll.indeterminate).toBe(true);
    expect(selectAll).not.toBeChecked();
  });

  it("reports the select-all toggle", () => {
    const { onToggleSelectAll } = renderTable();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all transactions on this page" }));

    expect(onToggleSelectAll).toHaveBeenCalledTimes(1);
  });

  it("hands the delete request the row and its trigger", () => {
    const { onRequestDelete } = renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Delete Groceries" }));

    expect(onRequestDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "transaction-1" }),
      expect.any(HTMLButtonElement),
    );
  });
});
