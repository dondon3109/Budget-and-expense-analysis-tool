import { parseAmountToMinor, type BudgetMonthPlan, type BudgetUpsert } from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDollarSign, PiggyBank, Share2, TrendingDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { ShareBudgetModal } from "../components/budgets/ShareBudgetModal";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { Skeleton, SkeletonStatus } from "../components/common/Skeleton";
import { AppShell } from "../components/layout/AppShell";
import { MonthSelector } from "../components/month/MonthSelector";
import { getBudgets, saveBudgets } from "../lib/api";
import { clearBudgetDraft, persistBudgetDraft, readBudgetDraft } from "../lib/budgetDraft";
import { currentMonth, isMonth } from "../lib/calendar";
import { formatFullMonth, formatMoney } from "../lib/formatters";
import { useUnsavedChangesWarning } from "../hooks/useUnsavedChangesWarning";
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
  /** A month the user picked while the plan was dirty, waiting on confirmation. */
  const [pendingMonth, setPendingMonth] = useState<string>();
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
    const seeded = Object.fromEntries(
      budgetQuery.data.items.map((item) => [item.categoryId, toAmountText(item.limitMinor)]),
    );
    // A draft that outlived the component (Back button, refresh, a crashed tab) wins over
    // the saved plan, so returning to the page finds the work still there.
    const restored = readBudgetDraft(budgetQuery.data.month);
    setDrafts(restored ? { ...seeded, ...restored } : seeded);
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
      // Saved work is no longer a draft, so nothing should be restored next visit.
      clearBudgetDraft(data.month);
    },
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets(workspace, monthStart) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) }),
      ]);
    },
  });

  function applyMonth(selectedMonth: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("month", selectedMonth);
      return next;
    });
  }

  function handlePendingMonthConfirm() {
    const selectedMonth = pendingMonth;
    setPendingMonth(undefined);
    if (selectedMonth) {
      clearBudgetDraft(monthStart);
      applyMonth(selectedMonth);
    }
  }

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

  // Numeric comparison so "500" is not treated as a change to a saved "500.00".
  const hasUnsavedEdits =
    data !== undefined &&
    data.items.some((item) => {
      const raw = drafts[item.categoryId];
      // Absent means the plan has not seeded this row yet, not that the user cleared it.
      if (raw === undefined) return false;
      const draft = raw.trim();
      if (draft === "") return item.limitMinor !== 0;
      const parsed = Number.parseFloat(draft);
      return !Number.isFinite(parsed) || Math.round(parsed * 100) !== item.limitMinor;
    });

  // One source of truth for "leaving this page now would lose the draft": the browser
  // unload prompt and both in-app guards (shell links and the month picker) read it.
  const blockNavigation = hasUnsavedEdits && !saveMutation.isPending;

  const discardDraft = useCallback(() => clearBudgetDraft(monthStart), [monthStart]);

  useUnsavedChangesWarning(blockNavigation, { onDiscard: discardDraft });

  useEffect(() => {
    if (!data) return;
    if (hasUnsavedEdits) persistBudgetDraft(monthStart, drafts);
    else clearBudgetDraft(monthStart);
  }, [data, drafts, hasUnsavedEdits, monthStart]);

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
                // Switching months re-seeds the drafts, so it loses the draft exactly
                // like leaving the page does. Picking the month already shown changes
                // nothing and stays unguarded.
                if (selectedMonth !== month && blockNavigation) {
                  setPendingMonth(selectedMonth);
                  return;
                }
                applyMonth(selectedMonth);
              }}
            />
          </div>
        </header>

        {budgetQuery.isPending && (
          <SkeletonStatus label="Loading your monthly plan">
            {/* Mirrors the real editor rows: category title, progress bar,
                monthly limit field, and remaining column. */}
            <section className="budget-editor-panel budget-editor-skeleton" aria-hidden="true">
              <div className="budget-editor-heading">
                <div>
                  <Skeleton width="150px" height={18} />
                  <Skeleton width="98px" height={12} />
                </div>
                <Skeleton width="168px" height={38} radius="var(--radius-sm)" />
              </div>
              <div className="budget-editor-list">
                {Array.from({ length: 4 }, (_, index) => (
                  <article className="budget-editor-row" key={index}>
                    <div className="budget-category-title">
                      <Skeleton width={10} height={10} radius="50%" />
                      <div>
                        <Skeleton width="124px" height={13} />
                        <Skeleton width="72px" height={10} />
                      </div>
                    </div>
                    <div className="budget-editor-progress">
                      <Skeleton height={8} radius="999px" />
                      <Skeleton width="64px" height={10} />
                    </div>
                    <div className="budget-amount-input">
                      <Skeleton width="72px" height={10} />
                      <Skeleton height="var(--control-height)" radius="var(--radius-sm)" />
                    </div>
                    <div className="budget-remaining">
                      <Skeleton width="56px" height={10} />
                      <Skeleton width="84px" height={13} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </SkeletonStatus>
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
                    {hasUnsavedEdits && !saveMutation.isPending && (
                      <span className="budget-dirty-note" role="status">
                        Unsaved changes
                      </span>
                    )}
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
        {pendingMonth && (
          <ConfirmDialog
            title="Discard unsaved changes?"
            consequence="Your unsaved changes will be lost. This cannot be undone."
            confirmLabel="Discard changes"
            cancelLabel="Keep editing"
            onConfirm={handlePendingMonthConfirm}
            onClose={() => setPendingMonth(undefined)}
          />
        )}
      </div>
    </AppShell>
  );
}
