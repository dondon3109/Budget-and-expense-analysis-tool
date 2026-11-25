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
    requiredPlan: "free",
    locked: false,
  },
  {
    id: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#6b7280",
    archived: false,
    system: true,
    origin: "system",
    requiredPlan: "free",
    locked: false,
  },
  {
    id: "uncategorized-transfer",
    name: "Uncategorized",
    kind: "transfer",
    color: "#6b7280",
    archived: false,
    system: true,
    origin: "system",
    requiredPlan: "free",
    locked: false,
  },
];

function renderFilters(overrides: Partial<Parameters<typeof TransactionFilters>[0]> = {}) {
  const props = {
    search: "",
    categories,
    accounts: [],
    hasFilters: false,
    onSearchChange: vi.fn(),
    onSearch: vi.fn(),
    onKindChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onAccountChange: vi.fn(),
    onFromChange: vi.fn(),
    onToChange: vi.fn(),
    onDatePreset: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<TransactionFilters {...props} />);
  return props;
}

describe("TransactionFilters", () => {
  afterEach(cleanup);

  it("distinguishes same-name system categories by transaction type", () => {
    renderFilters();

    expect(screen.getByRole("option", { name: "Uncategorized (Money in)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Uncategorized (Money out)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Uncategorized (Transfer)" })).toBeInTheDocument();
  });

  it("exposes broad transaction search and immediate Enter submission", () => {
    const props = renderFilters({ search: "market", hasFilters: true });

    const search = screen.getByRole("searchbox", {
      name: "Search transactions by description, notes, account, or category",
    });
    fireEvent.change(search, { target: { value: "groceries" } });
    expect(props.onSearchChange).toHaveBeenCalledWith("groceries");
    fireEvent.submit(search.closest("form")!);
    expect(props.onSearch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("offers date presets that replace the whole range", () => {
    const props = renderFilters({ from: "2026-01-01", to: "2026-01-31" });
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;

    const yearToDate = screen.getByRole("button", { name: "Year to date" });
    expect(yearToDate).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(yearToDate);
    expect(props.onDatePreset).toHaveBeenCalledWith({
      from: `${todayIso.slice(0, 4)}-01-01`,
      to: todayIso,
    });
  });

  it("marks the preset whose range is applied", () => {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    renderFilters({ from: todayIso, to: todayIso });

    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute(
      "aria-pressed",
      todayIso.endsWith("-01") ? "true" : "false",
    );
  });

  it("exposes declarative WebMCP filter controls and responds to agent submissions", async () => {
    const onAgentFilter = vi.fn(async (filters) => ({ total: 4, filters }));
    renderFilters({ onAgentFilter });

    const form = document.querySelector<HTMLFormElement>('form[toolname="filter-transactions"]')!;
    expect(form).toHaveAttribute("toolautosubmit", "");

    const searchInput = form.querySelector<HTMLInputElement>('input[name="search"]')!;
    const kindSelect = form.querySelector<HTMLSelectElement>('select[name="kind"]')!;
    const fromInput = form.querySelector<HTMLInputElement>('input[name="from"]')!;
    const toInput = form.querySelector<HTMLInputElement>('input[name="to"]')!;
    const categorySelect = form.querySelector<HTMLSelectElement>('select[name="categoryId"]')!;

    searchInput.value = "coffee";
    kindSelect.value = "expense";
    fromInput.value = "2026-11-01";
    toInput.value = "2026-11-25";
    categorySelect.value = "uncategorized-expense";

    let responsePromise: Promise<unknown> | undefined;
    form.dispatchEvent(
      Object.assign(new Event("submit", { bubbles: true, cancelable: true }), {
        agentInvoked: true,
        respondWith: (promise: Promise<unknown>) => {
          responsePromise = promise;
        },
      }),
    );

    expect(onAgentFilter).toHaveBeenCalledWith({
      search: "coffee",
      kind: "expense",
      accountId: undefined,
      categoryId: "uncategorized-expense",
      from: "2026-11-01",
      to: "2026-11-25",
    });
    await expect(responsePromise).resolves.toMatchObject({ total: 4 });

    fromInput.value = "2026-11-30";
    let errorPromise: Promise<unknown> | undefined;
    form.dispatchEvent(
      Object.assign(new Event("submit", { bubbles: true, cancelable: true }), {
        agentInvoked: true,
        respondWith: (promise: Promise<unknown>) => {
          errorPromise = promise;
        },
      }),
    );

    await expect(errorPromise).resolves.toEqual({
      error: "Start date must be on or before end date.",
    });
  });
});
