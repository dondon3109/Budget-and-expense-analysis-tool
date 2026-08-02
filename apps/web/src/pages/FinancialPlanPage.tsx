import type {
  AssistantCoachingStyle,
  AssistantResponseDetail,
  Debt,
  DebtInput,
  DebtUpdate,
  FinancialGoal,
  FinancialGoalInput,
  FinancialGoalUpdate,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { DebtForm } from "../components/planning/DebtForm";
import { FinancialGoalForm } from "../components/planning/FinancialGoalForm";
import {
  createDebt,
  createFinancialGoal,
  deleteDebt,
  deleteFinancialGoal,
  getAssistantPreferences,
  getDebts,
  getFinancialGoals,
  updateAssistantResponsePreferences,
  updateDebt,
  updateFinancialGoal,
} from "../lib/api";
import { formatMoney } from "../lib/formatters";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import "./FinancialPlanPage.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function debtTypeLabel(type: Debt["type"]): string {
  return {
    credit_card: "Credit card",
    personal_loan: "Personal loan",
    auto_loan: "Auto loan",
    mortgage: "Mortgage",
    other: "Other debt",
  }[type];
}

function goalUpdate(input: FinancialGoalInput): FinancialGoalUpdate {
  return { ...input };
}

function debtUpdateInput(input: DebtInput | DebtUpdate): DebtUpdate {
  return { ...input };
}

export function FinancialPlanPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [goalForm, setGoalForm] = useState<FinancialGoal | "new" | null>(null);
  const [debtForm, setDebtForm] = useState<Debt | "new" | null>(null);

  const goalsQuery = useQuery({
    queryKey: queryKeys.financialGoals(workspace),
    queryFn: () => getFinancialGoals(workspace),
  });
  const debtsQuery = useQuery({
    queryKey: queryKeys.debts(workspace),
    queryFn: () => getDebts(workspace),
  });
  const preferencesQuery = useQuery({
    queryKey: queryKeys.assistantPreferences(workspace),
    queryFn: () => getAssistantPreferences(workspace),
  });

  const refreshGoals = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.financialGoals(workspace) });
  const refreshDebts = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.debts(workspace) });

  const saveGoalMutation = useMutation({
    mutationFn: async (input: FinancialGoalInput) => {
      if (goalForm && goalForm !== "new") {
        return updateFinancialGoal(workspace, { id: goalForm.id, input: goalUpdate(input) });
      }
      return createFinancialGoal(workspace, input);
    },
    onSuccess: async () => {
      setGoalForm(null);
      await refreshGoals();
    },
  });
  const saveDebtMutation = useMutation({
    mutationFn: async (input: DebtInput | DebtUpdate) => {
      if (debtForm && debtForm !== "new") {
        return updateDebt(workspace, { id: debtForm.id, input: debtUpdateInput(input) });
      }
      return createDebt(workspace, input as DebtInput);
    },
    onSuccess: async () => {
      setDebtForm(null);
      await refreshDebts();
    },
  });
  const deleteGoalMutation = useMutation({
    mutationFn: (id: string) => deleteFinancialGoal(workspace, id),
    onSuccess: refreshGoals,
  });
  const deleteDebtMutation = useMutation({
    mutationFn: (id: string) => deleteDebt(workspace, id),
    onSuccess: refreshDebts,
  });
  const preferencesMutation = useMutation({
    mutationFn: (input: {
      responseDetail: AssistantResponseDetail;
      coachingStyle: AssistantCoachingStyle;
    }) => updateAssistantResponsePreferences(workspace, input),
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.assistantPreferences(workspace), preferences);
    },
  });

  const goals = goalsQuery.data?.items ?? [];
  const debts = debtsQuery.data?.items ?? [];
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const activeDebts = debts.filter((debt) => debt.status === "active");
  const goalSavedMinor = activeGoals.reduce((total, goal) => total + goal.currentAmountMinor, 0);
  const goalTargetMinor = activeGoals.reduce((total, goal) => total + goal.targetAmountMinor, 0);
  const activeDebtMinor = activeDebts.reduce((total, debt) => total + debt.balanceMinor, 0);
  const loading = goalsQuery.isPending || debtsQuery.isPending;
  const loadError = goalsQuery.error ?? debtsQuery.error;
  const mutationError =
    saveGoalMutation.error ??
    saveDebtMutation.error ??
    deleteGoalMutation.error ??
    deleteDebtMutation.error ??
    preferencesMutation.error;

  function confirmGoalDelete(goal: FinancialGoal) {
    if (window.confirm(`Delete “${goal.name}”? This cannot be undone.`)) {
      deleteGoalMutation.mutate(goal.id);
    }
  }

  function confirmDebtDelete(debt: Debt) {
    if (window.confirm(`Delete “${debt.name}”? This cannot be undone.`)) {
      deleteDebtMutation.mutate(debt.id);
    }
  }

  return (
    <AppShell>
      <main className="dashboard-page financial-plan-page">
        <header className="dashboard-header financial-plan-header">
          <div>
            <p className="eyebrow">Goals & debt</p>
            <h1>Your planning ledger</h1>
            <p>
              Keep the targets and balances that power Zoption’s deterministic savings and payoff
              projections.
            </p>
          </div>
          <div className="header-actions financial-plan-actions">
            <button className="button secondary" type="button" onClick={() => setDebtForm("new")}>
              <Landmark size={17} aria-hidden="true" /> Add debt
            </button>
            <button className="button primary" type="button" onClick={() => setGoalForm("new")}>
              <Target size={17} aria-hidden="true" /> Add goal
            </button>
          </div>
        </header>

        <section className="planning-trust-strip" aria-label="Planning data notice">
          <ShieldCheck size={19} aria-hidden="true" />
          <div>
            <strong>You stay in control of every record.</strong>
            <span>
              The assistant can read saved goals and debts for calculations, but chat can never edit
              or delete them.
            </span>
          </div>
        </section>

        {loading && <div className="full-page-status inline-status">Loading your plan…</div>}
        {loadError && (
          <div className="table-status error" role="alert">
            <strong>Your plan could not be loaded.</strong>
            <span>{loadError.message}</span>
            <button
              type="button"
              onClick={() => {
                void goalsQuery.refetch();
                void debtsQuery.refetch();
              }}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && (
          <>
            <section className="planning-overview" aria-label="Financial plan overview">
              <div className="planning-overview-lead">
                <span>Active goal progress</span>
                <strong>{formatMoney(goalSavedMinor)}</strong>
                <small>of {formatMoney(goalTargetMinor)} saved across active goals</small>
              </div>
              <div className="planning-overview-stat">
                <span>Active debt balance</span>
                <strong>{formatMoney(activeDebtMinor)}</strong>
                <small>{activeDebts.length} balances included in payoff planning</small>
              </div>
              <div className="planning-overview-stat">
                <span>Planning records</span>
                <strong>{goals.length + debts.length}</strong>
                <small>
                  {activeGoals.length} active goals · {activeDebts.length} active debts
                </small>
              </div>
            </section>

            <div className="planning-ledger">
              <section className="planning-column" aria-labelledby="goals-heading">
                <div className="planning-section-heading">
                  <div>
                    <Target size={18} aria-hidden="true" />
                    <div>
                      <h2 id="goals-heading">Savings goals</h2>
                      <p>Track what you are building toward and the date you want to reach it.</p>
                    </div>
                  </div>
                  <button className="text-button" type="button" onClick={() => setGoalForm("new")}>
                    <Plus size={15} aria-hidden="true" /> Add goal
                  </button>
                </div>

                {goals.length === 0 ? (
                  <div className="planning-empty">
                    <strong>Give your savings a destination.</strong>
                    <p>Add a target amount, current savings, and a realistic target date.</p>
                    <button
                      className="button primary compact"
                      type="button"
                      onClick={() => setGoalForm("new")}
                    >
                      Add your first goal
                    </button>
                  </div>
                ) : (
                  <div className="planning-record-list">
                    {goals.map((goal) => {
                      const progress = Math.min(
                        100,
                        Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 100),
                      );
                      return (
                        <article className={`planning-record goal ${goal.status}`} key={goal.id}>
                          <div className="planning-record-topline">
                            <div>
                              <strong>{goal.name}</strong>
                              <span className={`planning-status ${goal.status}`}>
                                {goal.status}
                              </span>
                            </div>
                            <div className="planning-record-actions">
                              <button
                                className="icon-button compact"
                                type="button"
                                onClick={() => setGoalForm(goal)}
                                aria-label={`Edit ${goal.name}`}
                              >
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                              <button
                                className="icon-button compact danger"
                                type="button"
                                onClick={() => confirmGoalDelete(goal)}
                                disabled={deleteGoalMutation.isPending}
                                aria-label={`Delete ${goal.name}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          <div className="goal-amount-line">
                            <strong>{formatMoney(goal.currentAmountMinor)}</strong>
                            <span>of {formatMoney(goal.targetAmountMinor)}</span>
                          </div>
                          <div
                            className="goal-progress"
                            role="progressbar"
                            aria-label={`${goal.name} progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                          >
                            <span style={{ width: `${progress}%` }} />
                          </div>
                          <div className="planning-record-meta">
                            <span>{progress}% saved</span>
                            <span>Target {formatDate(goal.targetDate)}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="planning-column" aria-labelledby="debts-heading">
                <div className="planning-section-heading">
                  <div>
                    <Landmark size={18} aria-hidden="true" />
                    <div>
                      <h2 id="debts-heading">Debt balances</h2>
                      <p>Keep the inputs needed for avalanche and snowball projections current.</p>
                    </div>
                  </div>
                  <button className="text-button" type="button" onClick={() => setDebtForm("new")}>
                    <Plus size={15} aria-hidden="true" /> Add debt
                  </button>
                </div>

                {debts.length === 0 ? (
                  <div className="planning-empty">
                    <strong>Add only the debts you want to plan around.</strong>
                    <p>Balances stay in Zoption and are not connected to your lender.</p>
                    <button
                      className="button secondary compact"
                      type="button"
                      onClick={() => setDebtForm("new")}
                    >
                      Add your first debt
                    </button>
                  </div>
                ) : (
                  <div className="planning-record-list">
                    {debts.map((debt) => (
                      <article className={`planning-record debt ${debt.status}`} key={debt.id}>
                        <div className="planning-record-topline">
                          <div>
                            <strong>{debt.name}</strong>
                            <span className={`planning-status ${debt.status}`}>{debt.status}</span>
                          </div>
                          <div className="planning-record-actions">
                            <button
                              className="icon-button compact"
                              type="button"
                              onClick={() => setDebtForm(debt)}
                              aria-label={`Edit ${debt.name}`}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                            <button
                              className="icon-button compact danger"
                              type="button"
                              onClick={() => confirmDebtDelete(debt)}
                              disabled={deleteDebtMutation.isPending}
                              aria-label={`Delete ${debt.name}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div className="debt-balance-line">
                          <strong>{formatMoney(debt.balanceMinor)}</strong>
                          <span>{(debt.aprBasisPoints / 100).toFixed(2)}% APR</span>
                        </div>
                        <div className="planning-record-meta">
                          <span>{debtTypeLabel(debt.type)}</span>
                          <span>Minimum {formatMoney(debt.minimumPaymentMinor)} / month</span>
                        </div>
                        <small>Balance recorded {formatDate(debt.balanceAsOf)}</small>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="planning-preferences" aria-labelledby="coaching-heading">
              <div className="planning-preferences-heading">
                <SlidersHorizontal size={19} aria-hidden="true" />
                <div>
                  <h2 id="coaching-heading">Assistant coaching style</h2>
                  <p>Choose how the assistant explains verified budgeting and planning results.</p>
                </div>
              </div>
              {preferencesQuery.isPending ? (
                <span className="planning-preferences-status">Loading preferences…</span>
              ) : preferencesQuery.isError ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void preferencesQuery.refetch()}
                >
                  <RefreshCw size={14} aria-hidden="true" /> Retry preferences
                </button>
              ) : preferencesQuery.data ? (
                <div className="planning-preference-controls">
                  <fieldset>
                    <legend>Response detail</legend>
                    <label>
                      <input
                        type="radio"
                        name="response-detail"
                        checked={preferencesQuery.data.responseDetail === "concise"}
                        onChange={() =>
                          preferencesMutation.mutate({
                            responseDetail: "concise",
                            coachingStyle: preferencesQuery.data.coachingStyle,
                          })
                        }
                      />
                      <span>
                        <strong>Concise</strong>
                        <small>Short conclusion and next step</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="response-detail"
                        checked={preferencesQuery.data.responseDetail === "standard"}
                        onChange={() =>
                          preferencesMutation.mutate({
                            responseDetail: "standard",
                            coachingStyle: preferencesQuery.data.coachingStyle,
                          })
                        }
                      />
                      <span>
                        <strong>Standard</strong>
                        <small>More context and assumptions</small>
                      </span>
                    </label>
                  </fieldset>
                  <fieldset>
                    <legend>Coaching tone</legend>
                    <label>
                      <input
                        type="radio"
                        name="coaching-style"
                        checked={preferencesQuery.data.coachingStyle === "gentle"}
                        onChange={() =>
                          preferencesMutation.mutate({
                            responseDetail: preferencesQuery.data.responseDetail,
                            coachingStyle: "gentle",
                          })
                        }
                      />
                      <span>
                        <strong>Gentle</strong>
                        <small>Supportive and reassuring</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="coaching-style"
                        checked={preferencesQuery.data.coachingStyle === "direct"}
                        onChange={() =>
                          preferencesMutation.mutate({
                            responseDetail: preferencesQuery.data.responseDetail,
                            coachingStyle: "direct",
                          })
                        }
                      />
                      <span>
                        <strong>Direct</strong>
                        <small>Plain and action-focused</small>
                      </span>
                    </label>
                  </fieldset>
                </div>
              ) : null}
            </section>
          </>
        )}

        {mutationError && (
          <p className="page-error" role="alert">
            {mutationError.message}
          </p>
        )}
      </main>

      {goalForm && (
        <FinancialGoalForm
          goal={goalForm === "new" ? undefined : goalForm}
          busy={saveGoalMutation.isPending}
          serverError={saveGoalMutation.error?.message}
          onSubmit={async (input) => {
            await saveGoalMutation.mutateAsync(input as FinancialGoalInput);
          }}
          onClose={() => {
            if (!saveGoalMutation.isPending) setGoalForm(null);
          }}
        />
      )}
      {debtForm && (
        <DebtForm
          debt={debtForm === "new" ? undefined : debtForm}
          busy={saveDebtMutation.isPending}
          serverError={saveDebtMutation.error?.message}
          onSubmit={async (input) => {
            await saveDebtMutation.mutateAsync(input);
          }}
          onClose={() => {
            if (!saveDebtMutation.isPending) setDebtForm(null);
          }}
        />
      )}
    </AppShell>
  );
}
