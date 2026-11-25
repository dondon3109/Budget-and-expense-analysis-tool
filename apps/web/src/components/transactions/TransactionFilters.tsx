import {
  transactionKinds,
  type AccountRecord,
  type CategoryRecord,
  type TransactionKind,
} from "@zoption/shared";
import { CalendarDays, Filter, Search, X } from "lucide-react";
import { useMemo, type FormEvent, type RefObject } from "react";
import {
  isAgentSubmit,
  respondToAgent,
  webMcpFormProps,
  webMcpParamProps,
} from "@zoption/web-common/webmcp";

import type { TransactionFilterState } from "../../hooks/useTransactionFilters";
import { localIsoDate } from "../../lib/calendar";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  onAgentFilter?: (filters: TransactionFilterState) => Promise<unknown>;
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

function readStringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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
  onAgentFilter,
}: TransactionFiltersProps) {
  const datePresets = useMemo(buildDatePresets, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAgentSubmit(event)) {
      onSearch();
      return;
    }

    const formData = new FormData(event.currentTarget);
    const nextSearch = readStringField(formData, "search");
    const rawKind = readStringField(formData, "kind");
    const nextAccountId = readStringField(formData, "accountId");
    const nextCategoryId = readStringField(formData, "categoryId");
    const nextFrom = readStringField(formData, "from");
    const nextTo = readStringField(formData, "to");

    if (rawKind && !(transactionKinds as readonly string[]).includes(rawKind)) {
      respondToAgent(event, { error: `Unsupported transaction type "${rawKind}".` });
      return;
    }
    if (
      (nextFrom && !ISO_DATE_PATTERN.test(nextFrom)) ||
      (nextTo && !ISO_DATE_PATTERN.test(nextTo))
    ) {
      respondToAgent(event, { error: "Dates must use YYYY-MM-DD format." });
      return;
    }
    if (nextFrom && nextTo && nextFrom > nextTo) {
      respondToAgent(event, { error: "Start date must be on or before end date." });
      return;
    }
    if (nextAccountId && accounts.length > 0 && !accounts.some((a) => a.id === nextAccountId)) {
      respondToAgent(event, { error: `Unknown account "${nextAccountId}".` });
      return;
    }
    if (
      nextCategoryId &&
      categories.length > 0 &&
      !categories.some((c) => c.id === nextCategoryId)
    ) {
      respondToAgent(event, { error: `Unknown category "${nextCategoryId}".` });
      return;
    }

    const nextFilters: TransactionFilterState = {
      search: nextSearch,
      kind: rawKind as TransactionKind | undefined,
      accountId: nextAccountId,
      categoryId: nextCategoryId,
      from: nextFrom,
      to: nextTo,
    };

    if (onAgentFilter) {
      respondToAgent(
        event,
        onAgentFilter(nextFilters).catch((error: unknown) => ({
          error: error instanceof Error ? error.message : "Could not filter transactions.",
        })),
      );
      return;
    }

    onSearchChange(nextSearch ?? "");
    onKindChange(nextFilters.kind);
    onAccountChange(nextAccountId);
    onFromChange(nextFrom);
    onToChange(nextTo);
    onCategoryChange(nextCategoryId);
    onSearch();
    respondToAgent(event, { filters: nextFilters });
  }

  return (
    <form
      className="transaction-filters"
      aria-label="Transaction filters"
      onSubmit={handleSubmit}
      {...webMcpFormProps({
        name: "filter-transactions",
        description:
          "Filter transactions in the active workspace by search text, type, account, date range, and category. Use when the user wants to find or narrow ledger activity.",
        autoSubmit: true,
      })}
    >
      <div className="search-form">
        <Search size={17} aria-hidden="true" />
        <label className="sr-only" htmlFor="transaction-search">
          Search transactions by description, notes, account, or category
        </label>
        <input
          ref={searchInputRef}
          id="transaction-search"
          name="search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search transactions"
          autoComplete="off"
          {...webMcpParamProps(
            "Keywords to match against transaction description, notes, account, or category.",
          )}
        />
      </div>
      <div className="filter-select-wrap">
        <Filter size={15} aria-hidden="true" />
        <label className="sr-only" htmlFor="kind-filter">
          Filter by transaction type
        </label>
        <select
          id="kind-filter"
          name="kind"
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
          name="accountId"
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
          name="from"
          type="date"
          value={from ?? ""}
          max={to}
          onChange={(event) => onFromChange(event.target.value || undefined)}
          {...webMcpParamProps("Start date (inclusive) in YYYY-MM-DD format.")}
        />
      </label>
      <label className="filter-date-wrap">
        <span>To</span>
        <input
          name="to"
          type="date"
          value={to ?? ""}
          min={from}
          onChange={(event) => onToChange(event.target.value || undefined)}
          {...webMcpParamProps("End date (inclusive) in YYYY-MM-DD format.")}
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
          name="categoryId"
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
    </form>
  );
}
