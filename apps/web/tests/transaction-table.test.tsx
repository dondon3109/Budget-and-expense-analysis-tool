// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionTable } from "../src/components/transactions/TransactionTable";

const item = {
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

function renderTable(
  sortBy: "date" | "description" | "amount" = "date",
  sortDirection: "asc" | "desc" = "desc",
) {
  const onSort = vi.fn();
  render(
    <TransactionTable
      items={[item]}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSort={onSort}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  return onSort;
}

afterEach(cleanup);

describe("TransactionTable sorting", () => {
  it("exposes the active sort direction", () => {
    renderTable("amount", "asc");

    expect(screen.getByRole("columnheader", { name: /amount/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByRole("columnheader", { name: /date/i })).not.toHaveAttribute("aria-sort");
  });

  it("sends the selected sortable field to the page", () => {
    const onSort = renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Sort by description" }));

    expect(onSort).toHaveBeenCalledWith("description");
  });
});
