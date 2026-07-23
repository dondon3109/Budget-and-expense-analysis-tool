import type { TransactionListItem, TransactionListQuery } from "@zoption/shared";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatMoney } from "../../lib/formatters";

interface TransactionTableProps {
  items: TransactionListItem[];
  sortBy: TransactionListQuery["sortBy"];
  sortDirection: TransactionListQuery["sortDirection"];
  deletingId?: string;
  onSort: (sortBy: TransactionListQuery["sortBy"]) => void;
  onEdit: (item: TransactionListItem) => void;
  onDelete: (id: string) => void;
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown size={13} />;
  return direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
}

export function TransactionTable({
  items,
  sortBy,
  sortDirection,
  deletingId,
  onSort,
  onEdit,
  onDelete,
}: TransactionTableProps) {
  const [confirmId, setConfirmId] = useState<string>();

  return (
    <div className="transaction-table-wrap">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>
              <button type="button" onClick={() => onSort("date")}>
                Date <SortIcon active={sortBy === "date"} direction={sortDirection} />
              </button>
            </th>
            <th>
              <button type="button" onClick={() => onSort("description")}>
                Description <SortIcon active={sortBy === "description"} direction={sortDirection} />
              </button>
            </th>
            <th>Category</th>
            <th>Type</th>
            <th className="amount-column">
              <button type="button" onClick={() => onSort("amount")}>
                Amount <SortIcon active={sortBy === "amount"} direction={sortDirection} />
              </button>
            </th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td data-label="Date">
                {new Intl.DateTimeFormat("en-PH", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${item.date}T00:00:00Z`))}
              </td>
              <td data-label="Description">
                <div className="transaction-description">
                  <strong>{item.description}</strong>
                  <span>
                    {item.accountName}
                    {item.notes ? ` · ${item.notes}` : ""}
                  </span>
                </div>
              </td>
              <td data-label="Category">
                <span className="category-chip">
                  <i style={{ backgroundColor: item.categoryColor }} />
                  {item.categoryName}
                </span>
              </td>
              <td data-label="Type">
                <span className={`kind-badge ${item.kind}`}>
                  {item.kind === "income"
                    ? "Money in"
                    : item.kind === "expense"
                      ? "Money out"
                      : "Transfer"}
                </span>
              </td>
              <td data-label="Amount" className={`amount-column amount-${item.kind}`}>
                {item.kind === "income" ? "+" : item.kind === "expense" ? "−" : ""}
                {formatMoney(Math.abs(item.amountMinor))}
              </td>
              <td className="row-actions">
                {confirmId === item.id ? (
                  <div className="confirm-delete">
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(item.id);
                        setConfirmId(undefined);
                      }}
                      disabled={deletingId === item.id}
                    >
                      Confirm
                    </button>
                    <button type="button" onClick={() => setConfirmId(undefined)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      aria-label={`Edit ${item.description}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(item.id)}
                      aria-label={`Delete ${item.description}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
