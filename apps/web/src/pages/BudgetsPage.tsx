import { parseAmountToMinor, type BudgetUpsert } from "@budget/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, CircleDollarSign, PiggyBank, TrendingDown } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { getBudgets, saveBudgets } from "../lib/api";
import { formatFullMonth, formatMoney } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";

function toAmountText(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

export function BudgetsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [month, setMonth] = useState("2026-07");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [clientError, setClientError] = useState<string>();
  const monthStart = `${month}-01`;
  const budgetQuery = useQuery({
    queryKey: queryKeys.budgets(workspace, monthStart),
    queryFn: () => getBudgets(workspace, monthStart),
  });

  useEffect(() => {
    if (!budgetQuery.data) return;
    setDrafts(
      Object.fromEntries(
        budgetQuery.data.items.map((item) => [item.categoryId, toAmountText(item.limitMinor)]),
      ),
    );
    setClientError(undefined);
  }, [budgetQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (input: BudgetUpsert) => saveBudgets(workspace, input),
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKeys.budgets(workspace, data.month), data);
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!budgetQuery.data) return;
    setClientError(undefined);
    try {
      const items: BudgetUpsert["items"] = budgetQuery.data.items.map((item) => {
        const limitMinor = parseAmountToMinor(drafts[item.categoryId] ?? "0");
        if (limitMinor < 0) throw new Error("Budget amounts cannot be negative.");
        return { categoryId: item.categoryId, limitMinor };
      });
      saveMutation.mutate({ month: monthStart, items });
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Check the budget amounts.");
    }
  }

  const data = budgetQuery.data;
  return (
    <AppShell mode="user">
      <div className="dashboard-page budgets-page">
        <header className="dashboard-header transaction-header">
          <div>
            <p className="eyebrow">Monthly plan</p>
            <h1>Budgets</h1>
            <p>Set practical limits by category and compare them with actual spending.</p>
          </div>
          <label className="budget-month-picker">
            <CalendarDays size={17} aria-hidden="true" />
            <span className="sr-only">Budget month</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </header>

        {budgetQuery.isPending && (
          <div className="full-page-status inline-status">Loading monthly plan…</div>
        )}
        {budgetQuery.isError && (
          <div className="table-status error" role="alert">
            <strong>The monthly budget could not be loaded.</strong>
            <span>{budgetQuery.error.message}</span>
            <button type="button" onClick={() => void budgetQuery.refetch()}>
              Try again
            </button>
          </div>
        )}

        {data && (
          <form onSubmit={handleSubmit}>
            <section
              className="budget-summary-grid"
              aria-label={`${formatFullMonth(month)} budget summary`}
            >
              <article>
                <PiggyBank size={19} />
                <span>Planned</span>
                <strong>{formatMoney(data.totalLimitMinor)}</strong>
              </article>
              <article>
                <TrendingDown size={19} />
                <span>Spent</span>
                <strong>{formatMoney(data.totalSpentMinor)}</strong>
              </article>
              <article className={data.remainingMinor < 0 ? "over" : ""}>
                <CircleDollarSign size={19} />
                <span>Remaining</span>
                <strong>{formatMoney(data.remainingMinor)}</strong>
              </article>
            </section>

            {data.items.length === 0 ? (
              <section className="empty-transactions">
                <strong>No expense categories are available.</strong>
                <p>Create an expense category from the Transactions page before setting budgets.</p>
              </section>
            ) : (
              <section className="budget-editor-panel">
                <div className="budget-editor-heading">
                  <div>
                    <strong>{formatFullMonth(month)}</strong>
                    <span>{data.usedPercent}% of the total plan used</span>
                  </div>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={saveMutation.isPending}
                  >
                    <Check size={17} /> {saveMutation.isPending ? "Saving…" : "Save monthly plan"}
                  </button>
                </div>
                <div className="budget-editor-list">
                  {data.items.map((item) => {
                    const width = Math.min(item.usedPercent, 100);
                    return (
                      <article
                        className={`budget-editor-row ${item.remainingMinor < 0 ? "over" : ""}`}
                        key={item.categoryId}
                      >
                        <div className="budget-category-title">
                          <i style={{ background: item.categoryColor }} />
                          <div>
                            <strong>{item.categoryName}</strong>
                            <span>{formatMoney(item.spentMinor)} spent</span>
                          </div>
                        </div>
                        <div className="budget-editor-progress">
                          <div>
                            <span style={{ width: `${width}%`, background: item.categoryColor }} />
                          </div>
                          <small>
                            {item.limitMinor === 0 ? "No limit set" : `${item.usedPercent}% used`}
                          </small>
                        </div>
                        <label className="budget-amount-input">
                          <span>Monthly limit</span>
                          <div>
                            <b>₱</b>
                            <input
                              inputMode="decimal"
                              value={drafts[item.categoryId] ?? ""}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [item.categoryId]: event.target.value,
                                }))
                              }
                              aria-label={`${item.categoryName} monthly budget`}
                            />
                          </div>
                        </label>
                        <div className="budget-remaining">
                          <span>{item.remainingMinor < 0 ? "Over by" : "Available"}</span>
                          <strong>{formatMoney(Math.abs(item.remainingMinor))}</strong>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            {(clientError || saveMutation.isError) && (
              <p className="page-error" role="alert">
                {clientError ?? saveMutation.error?.message}
              </p>
            )}
            {saveMutation.isSuccess && !saveMutation.isPending && (
              <p className="save-confirmation" role="status">
                <Check size={14} /> Monthly plan saved and dashboard refreshed.
              </p>
            )}
          </form>
        )}
      </div>
    </AppShell>
  );
}
