import type { BudgetQuery, BudgetUpsert } from "@zoption/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { BudgetRuleCalculator } from "../components/budgets/BudgetRuleCalculator";
import { useActiveWorkspace } from "../components/layout/ActiveWorkspaceProvider";
import { AppShell } from "../components/layout/AppShell";
import { saveBudgets } from "../lib/api";
import { currentMonth, isMonth } from "../lib/calendar";
import { formatFullMonth } from "../lib/formatters";
import { useAccounts } from "../queries/accounts";
import { invalidateAfterBudgetWrite, useBudgets } from "../queries/budgets";
import "./BudgetsPage.css";
import "../components/budgets/BudgetScopes.css";

type CalculatorScope = "month" | "every-month";

/** Standalone 50/30/20 calculator route that can auto-split an account balance and save straight to Budgets. */
export function BudgetCalculatorPage() {
  const { workspace, family } = useActiveWorkspace();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const month = isMonth(requestedMonth) ? requestedMonth : currentMonth();
  const scope: CalculatorScope =
    searchParams.get("scope") === "every-month" ? "every-month" : "month";
  const monthStart = `${month}-01`;
  const [applyStatus, setApplyStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const planQuery: BudgetQuery =
    scope === "every-month" ? { scope: "every-month" } : { scope: "month", month: monthStart };
  const budgetQuery = useBudgets(workspace, planQuery);
  const accountsQuery = useAccounts(workspace);

  const canEditBudgets = !family || family.role !== "viewer";
  const targetLabel = scope === "every-month" ? "Every month" : formatFullMonth(month);
  const budgetsHref =
    scope === "every-month" ? "/app/budgets?scope=every-month" : `/app/budgets?month=${month}`;

  const saveMutation = useMutation({
    mutationFn: (input: BudgetUpsert) => saveBudgets(workspace, input),
    onSuccess: (_data, input) => {
      void invalidateAfterBudgetWrite(queryClient, workspace);
      setApplyStatus({
        kind: "success",
        message: `Saved ${input.items.length} category ${input.items.length === 1 ? "limit" : "limits"} to ${targetLabel}.`,
      });
    },
    onError: (error) => {
      setApplyStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save budget limits.",
      });
    },
  });

  function switchScope(next: CalculatorScope) {
    setApplyStatus(null);
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === "month") updated.delete("scope");
      else updated.set("scope", next);
      return updated;
    });
  }

  return (
    <AppShell>
      <div className="dashboard-page budgets-page">
        <div className="budget-occasion-heading">
          <Link className="button secondary" to={budgetsHref}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to Budgets
          </Link>
        </div>

        <div className="budget-scope-tabs" role="tablist" aria-label="Apply target">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "month"}
            className={scope === "month" ? "active" : undefined}
            onClick={() => switchScope("month")}
          >
            {formatFullMonth(month)}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "every-month"}
            className={scope === "every-month" ? "active" : undefined}
            onClick={() => switchScope("every-month")}
          >
            Every month
          </button>
        </div>

        <BudgetRuleCalculator
          standalone
          accounts={accountsQuery.data}
          categories={budgetQuery.data?.items.map((item) => ({
            id: item.categoryId,
            name: item.categoryName,
            color: item.categoryColor,
          }))}
          currentPlanLimitMinor={budgetQuery.data?.totalLimitMinor}
          applyTargetLabel={targetLabel}
          canApply={canEditBudgets}
          applying={saveMutation.isPending}
          applyStatus={applyStatus}
          onApply={(items) => {
            setApplyStatus(null);
            saveMutation.mutate(
              scope === "every-month"
                ? { scope: "every-month", items }
                : { scope: "month", month: monthStart, items },
            );
          }}
        />
      </div>
    </AppShell>
  );
}
