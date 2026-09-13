import type { TransactionListItem, TransactionListQuery } from "@zoption/shared";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { formatMoney } from "../../lib/formatters";

interface TransactionTableProps {
  items: TransactionListItem[];
  sortBy: TransactionListQuery["sortBy"];
  sortDirection: TransactionListQuery["sortDirection"];
  /** Rows currently ticked for bulk actions. */
  selectedIds: ReadonlySet<string>;
  /** Rows with an in-flight request; their row controls are disabled. */
  busyIds?: ReadonlySet<string>;
  onSort: (sortBy: TransactionListQuery["sortBy"]) => void;
  onEdit: (item: TransactionListItem) => void;
  onRequestDelete: (item: TransactionListItem, trigger: HTMLButtonElement) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown size={13} aria-hidden="true" />;
  return direction === "asc" ? (
    <ArrowUp size={13} aria-hidden="true" />
  ) : (
    <ArrowDown size={13} aria-hidden="true" />
  );
}

function sortDescription(field: string, active: boolean, direction: "asc" | "desc") {
  if (!active) return `Sort by ${field}`;
  return `Sort by ${field}, currently ${direction === "asc" ? "ascending" : "descending"}`;
}

function kindLabel(kind: TransactionListItem["kind"]): string {
  if (kind === "income") return "Income";
  if (kind === "expense") return "Expense";
  return "Transfer";
}

export function TransactionTable({
  items,
  sortBy,
  sortDirection,
  selectedIds,
  busyIds,
  onSort,
  onEdit,
  onRequestDelete,
  onToggleSelect,
  onToggleSelectAll,
}: TransactionTableProps) {
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedOnPage = items.filter((item) => selectedIds.has(item.id)).length;
  const allSelected = items.length > 0 && selectedOnPage === items.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className="transaction-table-wrap">
      <table className="transaction-table">
        <caption className="sr-only">Transactions</caption>
        <thead>
          <tr>
            <th scope="col" className="transaction-select-column">
              <label className="transaction-select-label">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  aria-label="Select all transactions on this page"
                />
              </label>
            </th>
            <th
              scope="col"
              aria-sort={
                sortBy === "date"
                  ? sortDirection === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              <button
                type="button"
                aria-label={sortDescription("date", sortBy === "date", sortDirection)}
                onClick={() => onSort("date")}
              >
                Date <SortIcon active={sortBy === "date"} direction={sortDirection} />
              </button>
            </th>
            <th
              scope="col"
              aria-sort={
                sortBy === "description"
                  ? sortDirection === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              <button
                type="button"
                aria-label={sortDescription("description", sortBy === "description", sortDirection)}
                onClick={() => onSort("description")}
              >
                Description <SortIcon active={sortBy === "description"} direction={sortDirection} />
              </button>
            </th>
            <th scope="col">Category</th>
            <th scope="col">Type</th>
            <th
              scope="col"
              className="amount-column"
              aria-sort={
                sortBy === "amount"
                  ? sortDirection === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              <button
                type="button"
                aria-label={sortDescription("amount", sortBy === "amount", sortDirection)}
                onClick={() => onSort("amount")}
              >
                Amount <SortIcon active={sortBy === "amount"} direction={sortDirection} />
              </button>
            </th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            // Rows are programmatically focusable so the page's j/k shortcut can walk the
            // ledger without adding 240 tab stops.
            <tr key={item.id} data-ledger-row tabIndex={-1}>
              <td className="transaction-select-cell">
                <label className="transaction-select-label">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => onToggleSelect(item.id)}
                    disabled={busyIds?.has(item.id)}
                    aria-label={`Select ${item.description}`}
                  />
                </label>
              </td>
              <td className="transaction-date-cell" data-label="Date">
                {new Intl.DateTimeFormat("en-PH", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${item.date}T00:00:00Z`))}
              </td>
              <td className="transaction-description-cell" data-label="Description">
                <div className="transaction-description">
                  <strong>{item.description}</strong>
                  <span>
                    {item.kind === "transfer" && item.fromAccountName && item.toAccountName
                      ? `${item.fromAccountName} → ${item.toAccountName}`
                      : item.accountName}
                    {item.transferFeeMinor
                      ? ` · ${formatMoney(item.transferFeeMinor, item.currency)} fee`
                      : ""}
                    {item.notes ? ` · ${item.notes}` : ""}
                  </span>
                </div>
              </td>
              <td data-label="Category">
                <span className="category-chip">
                  {item.categoryIconEmoji ? (
                    <span className="category-chip-emoji" aria-hidden="true">
                      {item.categoryIconEmoji}
                    </span>
                  ) : (
                    <i style={{ backgroundColor: item.categoryColor }} />
                  )}
                  {item.categoryName}
                </span>
              </td>
              <td data-label="Type">
                <span className={`kind-badge ${item.kind}`}>{kindLabel(item.kind)}</span>
              </td>
              <td data-label="Amount" className={`amount-column amount-${item.kind}`}>
                {item.kind === "income" ? "+" : item.kind === "expense" ? "−" : ""}
                {formatMoney(Math.abs(item.amountMinor), item.currency)}
              </td>
              <td className="row-actions">
                <div>
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    disabled={busyIds?.has(item.id)}
                    aria-label={`Edit ${item.description}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => onRequestDelete(item, event.currentTarget)}
                    disabled={busyIds?.has(item.id)}
                    aria-label={`Delete ${item.description}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
