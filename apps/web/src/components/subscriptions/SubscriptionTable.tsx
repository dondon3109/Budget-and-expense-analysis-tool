import type { SubscriptionMonthItem, SubscriptionStatus } from "@zoption/shared";

import { formatMoney } from "../../lib/formatters";

interface SubscriptionTableProps {
  items: SubscriptionMonthItem[];
  updatingId?: string;
  onStatusChange: (id: string, status: SubscriptionStatus) => void;
}

function formatBillingDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function SubscriptionTable({ items, updatingId, onStatusChange }: SubscriptionTableProps) {
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
