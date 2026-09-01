import type { SubscriptionMonthItem, SubscriptionStatus } from "@zoption/shared";
import { HelpCircle, Pencil, Trash2 } from "lucide-react";

import { formatMoney } from "../../lib/formatters";

interface SubscriptionTableProps {
  items: SubscriptionMonthItem[];
  updatingId?: string;
  deletingId?: string;
  onStatusChange: (id: string, status: SubscriptionStatus) => void;
  onEdit: (item: SubscriptionMonthItem) => void;
  onDelete: (item: SubscriptionMonthItem) => void;
  onShowCancellationGuide?: (item: SubscriptionMonthItem) => void;
}

function formatBillingDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function SubscriptionTable({
  items,
  updatingId,
  deletingId,
  onStatusChange,
  onEdit,
  onDelete,
  onShowCancellationGuide,
}: SubscriptionTableProps) {
  return (
    <div className="subscription-table-wrap">
      <table className="subscription-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Billing date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const nextStatus = item.status === "active" ? "canceled" : "active";
            const actionLabel = item.status === "active" ? "Cancel" : "Reactivate";
            return (
              <tr key={item.id}>
                <td data-label="Name">
                  <strong className="subscription-name">{item.name}</strong>
                </td>
                <td data-label="Category">
                  <span className="category-chip">
                    <i style={{ backgroundColor: item.categoryColor }} />
                    {item.categoryName}
                  </span>
                </td>
                <td data-label="Amount">
                  <div className="subscription-amount">
                    <strong>{formatMoney(item.amountMinor)}</strong>
                    <span>
                      /{item.billingCycle === "monthly" ? "month" : "year"}
                      {item.billingCycle === "yearly"
                        ? ` · ${formatMoney(item.monthlyCostMinor)}/month equivalent`
                        : ""}
                    </span>
                  </div>
                </td>
                <td data-label="Billing date">
                  {item.billingDate ? (
                    formatBillingDate(item.billingDate)
                  ) : (
                    <span className="subscription-billing-empty">Not billed this month</span>
                  )}
                </td>
                <td data-label="Status">
                  <div className="subscription-status-cell">
                    <span className={`subscription-status-badge ${item.status}`}>
                      {item.status === "active" ? "Active" : "Canceled"}
                    </span>
                    <button
                      className="subscription-status-action"
                      type="button"
                      onClick={() => onStatusChange(item.id, nextStatus)}
                      disabled={updatingId === item.id}
                      aria-label={`${actionLabel} ${item.name}`}
                    >
                      {updatingId === item.id ? "Updating…" : actionLabel}
                    </button>
                  </div>
                </td>
                <td data-label="Actions">
                  <div className="subscription-actions">
                    {onShowCancellationGuide && (
                      <button
                        className="icon-button compact"
                        type="button"
                        onClick={() => onShowCancellationGuide(item)}
                        aria-label={`How to cancel ${item.name}`}
                        title="How to cancel"
                      >
                        <HelpCircle size={14} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      className="icon-button compact"
                      type="button"
                      onClick={() => onEdit(item)}
                      disabled={deletingId === item.id}
                      aria-label={`Edit ${item.name}`}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button compact danger"
                      type="button"
                      onClick={() => onDelete(item)}
                      disabled={deletingId === item.id}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
