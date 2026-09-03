import { parseAmountToMinor, type BudgetMonthPlan, type BudgetUpsert } from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDollarSign, PiggyBank, Share2, TrendingDown } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { ShareBudgetModal } from "../components/budgets/ShareBudgetModal";
import { AppShell } from "../components/layout/AppShell";
import { InlineLoader } from "../components/layout/InlineLoader";
import { MonthSelector } from "../components/month/MonthSelector";
import { getBudgets, saveBudgets } from "../lib/api";
import { currentMonth, isMonth } from "../lib/calendar";
import { formatFullMonth, formatMoney } from "../lib/formatters";
import { restoreOptimisticSnapshot, updateOptimistically } from "../lib/optimistic";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import "./BudgetsPage.css";

function toAmountText(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

export function BudgetsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const month = isMonth(requestedMonth) ? requestedMonth : currentMonth();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [clientError, setClientError] = useState<string>();
  const initializedDraftShapeRef = useRef<string | undefined>(undefined);
  const monthStart = `${month}-01`;
  const budgetQuery = useQuery({
    queryKey: queryKeys.budgets(workspace, monthStart),
    queryFn: () => getBudgets(workspace, monthStart),
  });

  useEffect(() => {
    if (!budgetQuery.data) return;
    const draftShape = `${budgetQuery.data.month}:${budgetQuery.data.items
      .map((item) => item.categoryId)
      .join(",")}`;
    if (initializedDraftShapeRef.current === draftShape) return;
    initializedDraftShapeRef.current = draftShape;
    setDrafts(
      Object.fromEntries(
        budgetQuery.data.items.map((item) => [item.categoryId, toAmountText(item.limitMinor)]),
      ),
    );
    setClientError(undefined);
  }, [budgetQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (input: BudgetUpsert) => saveBudgets(workspace, input),
    onMutate: async (input) => {
      const snapshot = await updateOptimistically<BudgetMonthPlan>(
        queryClient,
        queryKeys.budgets(workspace, input.month),
        (current) => {
          if (!current) return current;
          const limits = new Map(input.items.map((item) => [item.categoryId, item.limitMinor]));
          const items = current.items.map((item) => {
            const limitMinor = limits.get(item.categoryId) ?? item.limitMinor;
            const remainingMinor = limitMinor - item.spentMinor;
            return {
              ...item,
              limitMinor,
              remainingMinor,
              usedPercent:
                limitMinor > 0 ? Math.round((item.spentMinor / limitMinor) * 10_000) / 100 : 0,
            };
          });
          const totalLimitMinor = items.reduce((total, item) => total + item.limitMinor, 0);
          return {
            ...current,
            items,
            totalLimitMinor,
            remainingMinor: totalLimitMinor - current.totalSpentMinor,
            usedPercent:
              totalLimitMinor > 0
                ? Math.round((current.totalSpentMinor / totalLimitMinor) * 10_000) / 100
                : 0,
          };
        },
      );
      return { snapshot };
    },
    onError: (_error, _input, context) => {
      restoreOptimisticSnapshot(queryClient, context?.snapshot);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.budgets(workspace, data.month), data);
    },
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets(workspace, monthStart) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
      ]);
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
    <AppShell>
      <div className="dashboard-page budgets-page">
        <header className="dashboard-header transaction-header">
          <div>
            <p className="eyebrow">Monthly plan</p>
            <h1>Budgets</h1>
            <p>Set practical limits by category and compare them with actual spending.</p>
          </div>
          <div className="header-actions budgets-header-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setShareModalOpen(true)}
              disabled={!data || data.items.length === 0}
            >
              <Share2 size={17} aria-hidden="true" /> Share envelopes
            </button>
            <MonthSelector
              label="Budget month"
              value={month}
              onChange={(selectedMonth) => {
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set("month", selectedMonth);
                  return next;
                });
              }}
            />
          </div>
        </header>

        {budgetQuery.isPending && <InlineLoader label="Loading your monthly plan" />}
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
          <>
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
                <span>Budgeted spend</span>
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
                    const hasLimit = item.limitMinor > 0;
                    return (
                      <article
                        className={`budget-editor-row ${hasLimit && item.remainingMinor < 0 ? "over" : ""}`}
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
                          {hasLimit ? (
                            <>
                              <span>{item.remainingMinor < 0 ? "Over by" : "Available"}</span>
                              <strong>{formatMoney(Math.abs(item.remainingMinor))}</strong>
                            </>
                          ) : (
                            <span>Not budgeted</span>
                          )}
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
            <ShareBudgetModal
              isOpen={shareModalOpen}
              onClose={() => setShareModalOpen(false)}
              month={month}
              categories={data.items.map((item) => ({
                id: item.categoryId,
                name: item.categoryName,
                color: item.categoryColor,
                allocatedLimitMinor: item.limitMinor,
                spentMinor: item.spentMinor,
              }))}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
