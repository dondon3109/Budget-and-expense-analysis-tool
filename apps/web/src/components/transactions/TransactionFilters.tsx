import type { AccountRecord, CategoryRecord, TransactionKind } from "@budget/shared";
import { Filter, Search, X } from "lucide-react";
import type { FormEvent } from "react";

interface TransactionFiltersProps {
  search: string;
  kind?: TransactionKind;
  categoryId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  categories: CategoryRecord[];
  accounts: AccountRecord[];
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onKindChange: (value?: TransactionKind) => void;
  onCategoryChange: (value?: string) => void;
  onAccountChange: (value?: string) => void;
  onFromChange: (value?: string) => void;
  onToChange: (value?: string) => void;
  onClear: () => void;
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
  onSearchChange,
  onSearch,
  onKindChange,
  onCategoryChange,
  onAccountChange,
  onFromChange,
  onToChange,
  onClear,
}: TransactionFiltersProps) {
  const hasFilters = Boolean(search || kind || categoryId || accountId || from || to);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch();
  }

  return (
    <section className="transaction-filters" aria-label="Transaction filters">
      <form className="search-form" onSubmit={handleSubmit}>
        <Search size={17} aria-hidden="true" />
        <label className="sr-only" htmlFor="transaction-search">
          Search transaction descriptions
        </label>
        <input
          id="transaction-search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search descriptions"
        />
        <button type="submit">Search</button>
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
