import type { TransactionPage } from "@zoption/shared";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { formatMoney } from "../../lib/formatters";
import "./DashboardTransactionHistory.css";

interface DashboardTransactionHistoryProps {
  page?: TransactionPage;
  isPending: boolean;
  isFetching: boolean;
  error: Error | null;
  onRetry: () => void;
  onPageChange: (page: number) => void;
}

function formatTransactionDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function transactionContext(item: TransactionPage["items"][number]): string {
  if (item.kind === "transfer" && item.fromAccountName && item.toAccountName) {
    return `${item.fromAccountName} → ${item.toAccountName}`;
  }

  return item.accountName;
}

export function DashboardTransactionHistory({
  page,
  isPending,
  isFetching,
  error,
  onRetry,
  onPageChange,
}: DashboardTransactionHistoryProps) {
  const hasTransactions = (page?.items.length ?? 0) > 0;

  return (
    <section className="dashboard-history" aria-labelledby="dashboard-history-title">
      <header className="dashboard-history-heading">
        <div>
          <p className="eyebrow">All-time history</p>
          <h2 id="dashboard-history-title">Every transaction, in one place</h2>
          <p>
            Review records from every month here, or open Transactions to search, filter, and manage
            them.
          </p>
        </div>
        <Link className="dashboard-history-link" to="/app/transactions">
          Open transactions <ExternalLink size={15} aria-hidden="true" />
        </Link>
      </header>

      {isPending && (
        <div className="dashboard-history-status">Loading your transaction history…</div>
      )}
      {error && (
        <div className="dashboard-history-status error" role="alert">
          <strong>Transaction history could not be loaded.</strong>
          <span>{error.message}</span>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {page && !hasTransactions && (
        <div className="dashboard-history-status">
          <strong>No transactions yet.</strong>
          <span>When you add or import a record, it will appear in your all-time history.</span>
          <Link to="/app/transactions">Add a transaction</Link>
        </div>
      )}
      {page && hasTransactions && (
        <>
          <div className="dashboard-history-meta">
            <span>
              {page.total} transaction{page.total === 1 ? "" : "s"} across your full history
            </span>
            {isFetching && <span>Updating records…</span>}
          </div>
          <div className="dashboard-history-table-wrap">
            <table className="dashboard-history-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Category</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="dashboard-history-amount">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Date">{formatTransactionDate(item.date)}</td>
                    <td data-label="Description">
                      <div className="dashboard-history-description">
                        <strong>{item.description}</strong>
                        <span>{transactionContext(item)}</span>
                      </div>
                    </td>
                    <td data-label="Category">
                      <span className="dashboard-history-category">
                        <i style={{ backgroundColor: item.categoryColor }} />
                        {item.categoryName}
                      </span>
                    </td>
                    <td data-label="Type">
                      <span className={`dashboard-history-kind ${item.kind}`}>
                        {item.kind === "income"
                          ? "Income"
                          : item.kind === "expense"
                            ? "Expense"
                            : "Transfer"}
                      </span>
                    </td>
                    <td
                      data-label="Amount"
                      className={`dashboard-history-amount dashboard-history-amount-${item.kind}`}
                    >
                      {item.kind === "income" ? "+" : item.kind === "expense" ? "−" : ""}
                      {formatMoney(Math.abs(item.amountMinor), item.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.totalPages > 1 && (
            <footer className="dashboard-history-pagination">
              <span>
                Page {page.page} of {page.totalPages}
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => onPageChange(page.page - 1)}
                  disabled={page.page <= 1 || isFetching}
                  aria-label="Previous transaction history page"
                >
                  <ChevronLeft size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onPageChange(page.page + 1)}
                  disabled={page.page >= page.totalPages || isFetching}
                  aria-label="Next transaction history page"
                >
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </div>
            </footer>
          )}
        </>
      )}
    </section>
  );
}
