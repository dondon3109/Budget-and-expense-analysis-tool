// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord } from "@zoption/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionFilters } from "../src/components/transactions/TransactionFilters";

const categories: CategoryRecord[] = [
  {
    id: "uncategorized-income",
    name: "Uncategorized",
    kind: "income",
    color: "#6b7280",
    archived: false,
    system: true,
    origin: "system",
  },
  {
    id: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#6b7280",
    archived: false,
    system: true,
    origin: "system",
  },
  {
    id: "uncategorized-transfer",
    name: "Uncategorized",
    kind: "transfer",
    color: "#6b7280",
    archived: false,
    system: true,
    origin: "system",
  },
];

describe("TransactionFilters", () => {
  afterEach(cleanup);

  it("distinguishes same-name system categories by transaction type", () => {
    render(
      <TransactionFilters
        search=""
        categories={categories}
        accounts={[]}
        hasFilters={false}
        onSearchChange={vi.fn()}
        onSearch={vi.fn()}
        onKindChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onAccountChange={vi.fn()}
        onFromChange={vi.fn()}
        onToChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: "Uncategorized (Money in)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Uncategorized (Money out)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Uncategorized (Transfer)" })).toBeInTheDocument();
  });

  it("exposes broad transaction search and immediate Enter submission", () => {
    const onSearchChange = vi.fn();
    const onSearch = vi.fn();
    const onClear = vi.fn();
    render(
      <TransactionFilters
        search="market"
        categories={[]}
        accounts={[]}
        hasFilters
        onSearchChange={onSearchChange}
        onSearch={onSearch}
        onKindChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onAccountChange={vi.fn()}
        onFromChange={vi.fn()}
        onToChange={vi.fn()}
        onClear={onClear}
      />,
    );

    const search = screen.getByRole("searchbox", {
      name: "Search transactions by description, notes, account, or category",
    });
    fireEvent.change(search, { target: { value: "groceries" } });
    expect(onSearchChange).toHaveBeenCalledWith("groceries");
    fireEvent.submit(search.closest("form")!);
    expect(onSearch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
