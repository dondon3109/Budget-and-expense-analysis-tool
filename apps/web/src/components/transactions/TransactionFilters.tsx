import type { AccountRecord, CategoryRecord, TransactionKind } from "@zoption/shared";
import { CalendarDays, Filter, Search, X } from "lucide-react";
import { useMemo, type FormEvent, type RefObject } from "react";

import { localIsoDate } from "../../lib/calendar";

interface TransactionFiltersProps {
  search: string;
  kind?: TransactionKind;
  categoryId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  categories: CategoryRecord[];
  accounts: AccountRecord[];
  hasFilters: boolean;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onKindChange: (value?: TransactionKind) => void;
  onCategoryChange: (value?: string) => void;
  onAccountChange: (value?: string) => void;
  onFromChange: (value?: string) => void;
  onToChange: (value?: string) => void;
  onDatePreset: (range: { from: string; to: string }) => void;
  onClear: () => void;
}

interface DatePreset {
  id: string;
  label: string;
  from: string;
  to: string;
}

function buildDatePresets(): DatePreset[] {
  const today = localIsoDate();
  const last30Start = new Date();
  last30Start.setDate(last30Start.getDate() - 29);
  return [
    { id: "this-month", label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
    { id: "last-30-days", label: "Last 30 days", from: localIsoDate(last30Start), to: today },
    { id: "year-to-date", label: "Year to date", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

export function TransactionFilters({
  search,
  kind,
  categoryId,
  accountId,
  from,
  to,
  categories,
  accounts,
  hasFilters,
  searchInputRef,
  onSearchChange,
  onSearch,
  onKindChange,
  onCategoryChange,
  onAccountChange,
  onFromChange,
  onToChange,
  onDatePreset,
  onClear,
}: TransactionFiltersProps) {
  const datePresets = useMemo(buildDatePresets, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch();
  }

  return (
    <section className="transaction-filters" aria-label="Transaction filters">
      <form className="search-form" onSubmit={handleSubmit}>
        <Search size={17} aria-hidden="true" />
        <label className="sr-only" htmlFor="transaction-search">
          Search transactions by description, notes, account, or category
        </label>
        <input
          ref={searchInputRef}
          id="transaction-search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search transactions"
          autoComplete="off"
        />
      </form>
      <div className="filter-select-wrap">
        <Filter size={15} aria-hidden="true" />
        <label className="sr-only" htmlFor="kind-filter">
          Filter by transaction type
        </label>
        <select
          id="kind-filter"
          value={kind ?? ""}
          onChange={(event) =>
            onKindChange((event.target.value || undefined) as TransactionKind | undefined)
          }
        >
          <option value="">All types</option>
          <option value="income">Money in</option>
          <option value="expense">Money out</option>
          <option value="transfer">Transfers</option>
        </select>
      </div>
      <div className="filter-select-wrap">
        <label className="sr-only" htmlFor="account-filter">
          Filter by account
        </label>
        <select
          id="account-filter"
          value={accountId ?? ""}
          onChange={(event) => onAccountChange(event.target.value || undefined)}
        >
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {account.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </div>
      <label className="filter-date-wrap">
        <span>From</span>
        <input
          type="date"
          value={from ?? ""}
          max={to}
          onChange={(event) => onFromChange(event.target.value || undefined)}
        />
      </label>
      <label className="filter-date-wrap">
        <span>To</span>
        <input
          type="date"
          value={to ?? ""}
          min={from}
          onChange={(event) => onToChange(event.target.value || undefined)}
        />
      </label>
      <div className="filter-presets" role="group" aria-label="Date presets">
        <CalendarDays size={15} aria-hidden="true" />
        {datePresets.map((preset) => {
          const active = from === preset.from && to === preset.to;
          return (
            <button
              key={preset.id}
              type="button"
              className={active ? "active" : undefined}
              aria-pressed={active}
              onClick={() => onDatePreset({ from: preset.from, to: preset.to })}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="filter-select-wrap">
        <label className="sr-only" htmlFor="category-filter">
          Filter by category
        </label>
        <select
          id="category-filter"
          value={categoryId ?? ""}
          onChange={(event) => onCategoryChange(event.target.value || undefined)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.system
                ? ` (${category.kind === "income" ? "Money in" : category.kind === "expense" ? "Money out" : "Transfer"})`
                : ""}
              {category.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </div>
      {hasFilters && (
        <button className="clear-filter" type="button" onClick={onClear}>
          <X size={14} /> Clear
        </button>
      )}
    </section>
  );
}
