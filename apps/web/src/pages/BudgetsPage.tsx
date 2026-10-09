import {
  currencyMetadata,
  formatMinorAmount,
  parseAmountToMinor,
  type BudgetPlan,
  type BudgetQuery,
  type BudgetUpsert,
} from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDollarSign, PiggyBank, Share2, TrendingDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { BudgetOccasions } from "../components/budgets/BudgetOccasions";
import { BudgetScopeTabs, type BudgetTab } from "../components/budgets/BudgetScopeTabs";
import { ShareBudgetModal } from "../components/budgets/ShareBudgetModal";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { Skeleton, SkeletonStatus } from "../components/common/Skeleton";
import { AppShell } from "../components/layout/AppShell";
import { MonthSelector } from "../components/month/MonthSelector";
import { saveBudgets } from "../lib/api";
import { clearBudgetDraft, persistBudgetDraft, readBudgetDraft } from "../lib/budgetDraft";
import { currentMonth, formatCalendarDate, isMonth } from "../lib/calendar";
import { formatFullMonth, formatMoney } from "../lib/formatters";
import { useUnsavedChangesWarning } from "../hooks/useUnsavedChangesWarning";
import { restoreOptimisticSnapshot, updateOptimistically } from "../lib/optimistic";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import { budgetPlanKey, invalidateAfterBudgetWrite, useBudgets } from "../queries/budgets";
import "./BudgetsPage.css";
import { useWorkspaceCurrency } from "../lib/workspaceCurrency";

export function BudgetsPage() {
  const currencySymbol = currencyMetadata[useWorkspaceCurrency()].symbol;
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const month = isMonth(requestedMonth) ? requestedMonth : currentMonth();
  const requestedScope = searchParams.get("scope");
  const tab: BudgetTab =
    requestedScope === "every-month" || requestedScope === "occasions" ? requestedScope : "month";
  const occasionId = tab === "occasions" ? searchParams.get("occasion") : null;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [clientError, setClientError] = useState<string>();
  /** A month the user picked while the plan was dirty, waiting on confirmation. */
  const [pendingMonth, setPendingMonth] = useState<string>();
  const initializedDraftShapeRef = useRef<string | undefined>(undefined);
  const monthStart = `${month}-01`;
  // The plan open in the editor; the occasion list has none.
  const planQuery: BudgetQuery | null =
    tab === "every-month"
      ? { scope: "every-month" }
      : tab === "occasions"
        ? occasionId
          ? { scope: "occasion", eventId: occasionId }
          : null
        : { scope: "month", month: monthStart };
  const planKey = planQuery ? budgetPlanKey(planQuery) : monthStart;
  const budgetQuery = useBudgets(workspace, planQuery);

  useEffect(() => {
    if (!budgetQuery.data) return;
    const draftShape = `${planKey}:${budgetQuery.data.items
      .map((item) => item.categoryId)
      .join(",")}`;
    if (initializedDraftShapeRef.current === draftShape) return;
    initializedDraftShapeRef.current = draftShape;
    const seeded = Object.fromEntries(
      budgetQuery.data.items.map((item) => [item.categoryId, formatMinorAmount(item.limitMinor)]),
    );
    // A draft that outlived the component (Back button, refresh, a crashed tab) wins over
    // the saved plan, so returning to the page finds the work still there.
    const restored = readBudgetDraft(planKey);
    setDrafts(restored ? { ...seeded, ...restored } : seeded);
    setClientError(undefined);
  }, [budgetQuery.data, planKey]);

  const saveMutation = useMutation({
    mutationFn: (input: BudgetUpsert) => saveBudgets(workspace, input),
    onMutate: async (input) => {
      const snapshot = await updateOptimistically<BudgetPlan>(
        queryClient,
        queryKeys.budgets(workspace, planKey),
        (current) => {
          if (!current) return current;
          const limits = new Map(input.items.map((item) => [item.categoryId, item.limitMinor]));
          const items = current.items.map((item) => {
            const limitMinor = limits.get(item.categoryId) ?? item.limitMinor;
            const hasLimit = limitMinor > 0;
            return {
              ...item,
              limitMinor,
              remainingMinor: hasLimit ? limitMinor - item.spentMinor : 0,
              usedPercent: hasLimit ? Math.round((item.spentMinor / limitMinor) * 10_000) / 100 : 0,
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
      queryClient.setQueryData(queryKeys.budgets(workspace, planKey), data);
      // Saved work is no longer a draft, so nothing should be restored next visit.
      clearBudgetDraft(planKey);
    },
    onSettled: () => {
      void invalidateAfterBudgetWrite(queryClient, workspace);
    },
  });

  function applyParams(changes: Record<string, string | null>) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  }

  function applyMonth(selectedMonth: string) {
    applyParams({ month: selectedMonth, occasion: null });
  }

  /** Switching tabs or occasions re-seeds the drafts, so it asks like a month change does. */
  const [pendingParams, setPendingParams] = useState<Record<string, string | null>>();
  function navigatePlan(changes: Record<string, string | null>) {
    if (blockNavigation) {
      setPendingParams(changes);
      return;
    }
    applyParams(changes);
  }

  function handlePendingMonthConfirm() {
    const selectedMonth = pendingMonth;
    const params = pendingParams;
    setPendingMonth(undefined);
    setPendingParams(undefined);
    clearBudgetDraft(planKey);
    if (selectedMonth) applyMonth(selectedMonth);
    else if (params) applyParams(params);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!budgetQuery.data) return;
    setClientError(undefined);
    try {
      // Only the rows that changed are saved, so a month keeps inheriting every-month limits
      // it did not touch instead of copying them.
      const items: BudgetUpsert["items"] = budgetQuery.data.items.flatMap((item) => {
        const limitMinor = parseAmountToMinor(drafts[item.categoryId] ?? "0");
        if (limitMinor < 0) throw new Error("Budget amounts cannot be negative.");
        return limitMinor === item.limitMinor ? [] : [{ categoryId: item.categoryId, limitMinor }];
      });
      if (items.length === 0) {
        setClientError("There are no changes to save.");
        return;
      }
      saveMutation.mutate(
        planQuery?.scope === "occasion"
          ? { scope: "occasion", eventId: planQuery.eventId, items }
          : planQuery?.scope === "every-month"
            ? { scope: "every-month", items }
            : { scope: "month", month: monthStart, items },
      );
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Check the budget amounts.");
    }
  }

  const data = budgetQuery.data;

  // Parsed the way save parses, so "8,500" is not a change to a saved "8500.00".
  const hasUnsavedEdits =
    data !== undefined &&
    data.items.some((item) => {
      const raw = drafts[item.categoryId];
      // Absent means the plan has not seeded this row yet, not that the user cleared it.
      if (raw === undefined) return false;
      const draft = raw.trim();
      if (draft === "") return item.limitMinor !== 0;
      try {
        return parseAmountToMinor(draft) !== item.limitMinor;
      } catch {
        return true;
      }
    });

  // One source of truth for "leaving this page now would lose the draft": the browser
  // unload prompt and both in-app guards (shell links and the month picker) read it.
  const blockNavigation = hasUnsavedEdits && !saveMutation.isPending;

  const discardDraft = useCallback(() => clearBudgetDraft(planKey), [planKey]);

  useUnsavedChangesWarning(blockNavigation, { onDiscard: discardDraft });

  useEffect(() => {
    if (!data) return;
    if (hasUnsavedEdits) persistBudgetDraft(planKey, drafts);
    else clearBudgetDraft(planKey);
  }, [data, drafts, hasUnsavedEdits, planKey]);

  const planLabel =
    tab === "every-month"
      ? "Every month"
      : occasionId
        ? (data?.title ?? "Occasion")
        : formatFullMonth(month);
  const saveLabel =
    tab === "every-month"
      ? "Save every-month plan"
      : occasionId
        ? "Save occasion budget"
        : "Save monthly plan";

  return (
    <AppShell>
      <div className="dashboard-page budgets-page">
        <header className="dashboard-header transaction-header">
          <div>
            <p className="eyebrow">
              {tab === "every-month"
                ? "Every month"
                : tab === "occasions"
                  ? "Occasions"
                  : "Monthly plan"}
            </p>
            <h1>Budgets</h1>
            <p>
              {tab === "every-month"
                ? "Limits every month starts from. A month can set its own for any category."
                : tab === "occasions"
                  ? "Plan a birthday, trip, or holiday with its own limits, apart from your monthly budget."
                  : "Set practical limits by category and compare them with actual spending."}
            </p>
          </div>
          <div className="header-actions budgets-header-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setShareModalOpen(true)}
              disabled={!data || data.items.length === 0 || tab !== "month"}
            >
              <Share2 size={17} aria-hidden="true" /> Share envelopes
            </button>
            {tab !== "every-month" && !occasionId && (
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
            )}
          </div>
        </header>

        <BudgetScopeTabs
          value={tab}
          onChange={(next) => {
            if (next === tab && !occasionId) return;
            navigatePlan({ scope: next === "month" ? null : next, occasion: null });
          }}
        />

        {tab === "occasions" && !occasionId && (
          <BudgetOccasions
            workspace={workspace}
            monthStart={monthStart}
            onOpen={(eventId) => navigatePlan({ scope: "occasions", occasion: eventId })}
          />
        )}

        {occasionId && (
          <div className="budget-occasion-heading">
            <button
              type="button"
              className="button secondary"
              onClick={() => navigatePlan({ occasion: null })}
            >
              All occasions
            </button>
            {data?.title && (
              <p>
                <strong>{data.title}</strong>
                {data.date ? ` · ${formatCalendarDate(data.date)}` : ""}
              </p>
            )}
          </div>
        )}

        {budgetQuery.isLoading && (
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
              <section className="budget-summary-grid" aria-label={`${planLabel} budget summary`}>
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
                  <p>
                    Create an expense category from the Transactions page before setting budgets.
                  </p>
                </section>
              ) : (
                <section className="budget-editor-panel">
                  <div className="budget-editor-heading">
                    <div>
                      <strong>{planLabel}</strong>
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
                      <Check size={17} /> {saveMutation.isPending ? "Saving…" : saveLabel}
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
                            <i style={{ background: item.categoryColor }} aria-hidden="true" />
                            <div>
                              <strong>{item.categoryName}</strong>
                              <span>
                                {tab === "every-month"
                                  ? "Every month"
                                  : `${formatMoney(item.spentMinor)} spent`}
                                {tab === "month" && item.source === "every-month" && (
                                  <em className="budget-source-note"> · Every month</em>
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="budget-editor-progress">
                            <div>
                              <span
                                style={{
                                  width: `${width}%`,
                                  // Over-limit rows take the danger fill from the stylesheet.
                                  background:
                                    hasLimit && item.remainingMinor < 0
                                      ? undefined
                                      : item.categoryColor,
                                }}
                              />
                            </div>
                            <small>
                              {item.limitMinor === 0 ? "No limit set" : `${item.usedPercent}% used`}
                            </small>
                          </div>
                          <label className="budget-amount-input">
                            <span>
                              {tab === "every-month" ? "Limit each month" : "Monthly limit"}
                            </span>
                            <div>
                              <b>{currencySymbol}</b>
                              <input
                                inputMode="decimal"
                                value={drafts[item.categoryId] ?? ""}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [item.categoryId]: event.target.value,
                                  }))
                                }
                                aria-label={`${item.categoryName} ${tab === "month" ? "monthly budget" : tab === "every-month" ? "every-month budget" : "occasion budget"}`}
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
                  <Check size={14} /> Plan saved and dashboard refreshed.
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
        {(pendingMonth || pendingParams) && (
          <ConfirmDialog
            title="Discard unsaved changes?"
            consequence="Your unsaved changes will be lost. This cannot be undone."
            confirmLabel="Discard changes"
            cancelLabel="Keep editing"
            onConfirm={handlePendingMonthConfirm}
            onClose={() => {
              setPendingMonth(undefined);
              setPendingParams(undefined);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
