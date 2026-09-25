import type {
  SubscriptionMonthItem,
  SubscriptionRenewalReason,
  SubscriptionStatus,
} from "@zoption/shared";
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

/**
 * Why a due cycle is not being charged, in the same terms the reminder email uses. The blocked
 * cycle is always the stored next billing date, which can be earlier than the month shown in the
 * billing date column, so the note names it.
 */
function renewalBlockedNote(reason: SubscriptionRenewalReason, dueDate: string): string {
  const cycle = formatBillingDate(dueDate);
  return reason === "account_archived"
    ? `${cycle} not renewed: account removed`
    : `${cycle} not renewed: not enough balance`;
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
        <caption className="sr-only">Subscription renewals</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Billing date</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
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
                    {item.status === "active" && item.renewalBlockedReason ? (
                      <span className="subscription-renewal-blocked">
                        {renewalBlockedNote(item.renewalBlockedReason, item.nextBillingDate)}
                      </span>
                    ) : null}
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
