// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord } from "@budget/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransactionFilters } from "../src/components/transactions/TransactionFilters";

const categories: CategoryRecord[] = [
  {
    id: "uncategorized-income",
    name: "Uncategorized",
    kind: "income",
    color: "#6b7280",
    archived: false,
    system: true,
  },
  {
    id: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#6b7280",
    archived: false,
    system: true,
  },
  {
    id: "uncategorized-transfer",
    name: "Uncategorized",
    kind: "transfer",
    color: "#6b7280",
    archived: false,
    system: true,
  },
];

describe("TransactionFilters", () => {
  it("distinguishes same-name system categories by transaction type", () => {
    render(
      <TransactionFilters
        search=""
        categories={categories}
        accounts={[]}
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
});
