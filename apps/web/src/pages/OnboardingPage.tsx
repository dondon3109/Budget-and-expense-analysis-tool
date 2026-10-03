import {
  currencies,
  currencyMetadata,
  onboardingCashSchema,
  parseAmountToMinor,
  type Currency,
} from "@zoption/shared";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";
import { FullPageLoadingStatus } from "../components/layout/FullPageLoadingStatus";
import { GoalPicker } from "../components/onboarding/GoalPicker";
import { isApiRequestError } from "../lib/api";
import { userWorkspace, type AuthenticatedWorkspace } from "../lib/workspace";
import {
  useGoalProfile,
  useMarkGoalShown,
  useSaveGoals,
  useSkipGoal,
} from "../queries/goalProfile";
import {
  useOnboarding,
  useSaveOnboardingCashBalance,
  useSaveOnboardingCurrency,
} from "../queries/onboarding";
import "./OnboardingPage.css";

const STEPS = ["Your goal", "Base currency", "Starting cash", "All set"] as const;

/** The user's calendar day, which the server cannot know. */
function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The message for the amount field, or the parsed minor units when it is valid. */
function checkAmount(value: string): { error: string } | { amountMinor: number } {
  if (!value.trim()) return { error: "Enter the cash you have on hand, or 0." };
  let amountMinor: number;
  try {
    amountMinor = parseAmountToMinor(value);
  } catch {
    return { error: "Enter a number with no more than two decimal places." };
  }
  const parsed = onboardingCashSchema.safeParse({ amountMinor, date: localDate() });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the amount." };
  }
  return { amountMinor };
}

/**
 * Never blocks: a failed save or skip still lets the user continue to the next step. A saved
 * answer goes to `onSaved` so the page can thank the user before moving on.
 */
function GoalStep({
  workspace,
  onSaved,
  onDone,
}: {
  workspace: AuthenticatedWorkspace;
  onSaved: () => void;
  onDone: () => void;
}) {
  const saveGoal = useSaveGoals(workspace);
  const skipGoal = useSkipGoal(workspace);
  const { mutate: markShown } = useMarkGoalShown(workspace);
  // The server keeps one "shown" row per workspace, so a repeat call is harmless.
  useEffect(() => markShown(), [markShown]);

  return (
    <div className="auth-form">
      <p className="onboarding-help">So we can set up the right starting point for you.</p>
      <GoalPicker
        legend="Your goals"
        goals={[]}
        otherText={null}
        disabled={saveGoal.isPending || skipGoal.isPending}
        confirmLabel="Continue"
        onChoose={(choice) => saveGoal.mutateAsync(choice).then(onSaved, onDone)}
      />
      <button
        className="button secondary"
        type="button"
        disabled={saveGoal.isPending || skipGoal.isPending}
        onClick={() => skipGoal.mutate(undefined, { onSettled: onDone })}
      >
        Skip
      </button>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="onboarding-stepper" aria-label="Setup progress">
      {STEPS.map((label, index) => {
        const status = index < current ? "completed" : index === current ? "current" : "upcoming";
        return (
          <li
            key={label}
            className={`onboarding-step ${status}`}
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className="onboarding-step-circle" aria-hidden="true">
              {status === "completed" ? "✓" : index + 1}
            </span>
            <span className="onboarding-step-label">
              {label}
              <span className="onboarding-step-status">
                {status === "completed" ? " (done)" : status === "upcoming" ? " (next)" : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OnboardingPage() {
  const { user, loading } = useAuth();
  if (loading || !user)
    return (
      <FullPageLoadingStatus
        title="Getting your setup ready"
        description="Checking your workspace."
      />
    );
  return <Onboarding workspace={userWorkspace(user)} />;
}

function Onboarding({ workspace }: { workspace: ReturnType<typeof userWorkspace> }) {
  const navigate = useNavigate();
  const stateQuery = useOnboarding(workspace);
  const goalQuery = useGoalProfile(workspace);
  const saveCurrency = useSaveOnboardingCurrency(workspace);
  const saveCash = useSaveOnboardingCashBalance(workspace);
  const currencyId = useId();
  const amountId = useId();
  // Local only: a pick not yet confirmed, the typed amount, and whether the user stepped back.
  const [pickedCurrency, setPickedCurrency] = useState<Currency>();
  const [amount, setAmount] = useState("0");
  const [submitted, setSubmitted] = useState(false);
  const [steppedBack, setSteppedBack] = useState(false);
  const [finished, setFinished] = useState(false);
  const [goalDismissed, setGoalDismissed] = useState(false);
  const [goalThanked, setGoalThanked] = useState(false);
  const [openingBalanceSkipped, setOpeningBalanceSkipped] = useState(false);

  if (stateQuery.isPending || (stateQuery.data?.step === "currency" && goalQuery.isPending))
    return (
      <FullPageLoadingStatus
        title="Getting your setup ready"
        description="Checking your workspace."
      />
    );
  if (stateQuery.isError) {
    return (
      <AuthLayout
        eyebrow="Welcome"
        title="We could not load your setup"
        description="Refresh the page to try again."
      >
        <p className="form-error" role="alert">
          Your setup could not be loaded.
        </p>
        <button
          className="button secondary"
          type="button"
          onClick={() => void stateQuery.refetch()}
        >
          Try again
        </button>
      </AuthLayout>
    );
  }

  const state = stateQuery.data;
  // A finished workspace has nothing to set up, unless the user just finished it here.
  // The cash write flips the cached step before it resolves, so it is not "already finished" then.
  const finishing = saveCash.isPending || saveCash.isSuccess;
  if (state.step === "complete" && !finished && !finishing) return <Navigate to="/app" replace />;

  // Only a new workspace that has neither chosen nor skipped sees the goal, and only until it
  // answers once here. A saved answer is thanked first, so the step outlives the saved goal. If
  // the goal profile fails to load, setup carries on without it.
  const goalProfile = goalQuery.data;
  const askGoal =
    state.step === "currency" &&
    !finished &&
    !goalDismissed &&
    (goalThanked || (goalProfile?.goal === null && !goalProfile.skipped));
  const view = finished
    ? "complete"
    : askGoal
      ? goalThanked
        ? "thanks"
        : "goal"
      : steppedBack
        ? "currency"
        : state.step;
  const selected = pickedCurrency ?? state.currency;
  const { symbol } = currencyMetadata[state.currency];
  const amountCheck = checkAmount(amount);
  const amountError = submitted && "error" in amountCheck ? amountCheck.error : undefined;

  async function confirmCurrency(event: FormEvent) {
    event.preventDefault();
    try {
      await saveCurrency.mutateAsync({ currency: selected });
      setSteppedBack(false);
    } catch {
      // The error state below tells the user to try again.
    }
  }

  async function confirmCash(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if ("error" in amountCheck) return;
    try {
      const result = await saveCash.mutateAsync({
        amountMinor: amountCheck.amountMinor,
        date: localDate(),
      });
      setOpeningBalanceSkipped(amountCheck.amountMinor > 0 && !result.openingBalanceBooked);
      setFinished(true);
    } catch (error) {
      // A repeat submit after a success already created the account; the state is complete.
      if (isApiRequestError(error) && error.code === "onboarding_complete") setFinished(true);
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome to Zoption"
      title={
        view === "goal"
          ? "What brings you to Zoption?"
          : view === "thanks"
            ? "Thank you!"
            : view === "currency"
              ? "Choose your base currency"
              : view === "cash"
                ? "How much cash do you have?"
                : "Your first account is ready"
      }
      description={
        view === "complete"
          ? "Your workspace is set up."
          : "A few quick questions, then you can start tracking."
      }
    >
      <Stepper
        current={
          view === "goal" || view === "thanks"
            ? 0
            : view === "currency"
              ? 1
              : view === "cash"
                ? 2
                : 4
        }
      />

      {view === "goal" && (
        <GoalStep
          workspace={workspace}
          onSaved={() => setGoalThanked(true)}
          onDone={() => setGoalDismissed(true)}
        />
      )}

      {view === "thanks" && (
        <div className="auth-form">
          <p className="onboarding-help" role="status">
            Thanks for taking a moment to tell us. We've set Zoption up around what matters to you.
          </p>
          <button className="button primary" type="button" onClick={() => setGoalDismissed(true)}>
            Continue
          </button>
        </div>
      )}

      {view === "currency" && (
        <form className="auth-form" onSubmit={(event) => void confirmCurrency(event)}>
          <label htmlFor={currencyId} className="onboarding-field">
            <span>Base currency</span>
            <select
              id={currencyId}
              value={selected}
              disabled={saveCurrency.isPending}
              aria-describedby={`${currencyId}-help`}
              onChange={(event) => setPickedCurrency(event.target.value as Currency)}
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code} - {currencyMetadata[code].name}
                </option>
              ))}
            </select>
          </label>
          <p id={`${currencyId}-help`} className="onboarding-help">
            Pick the currency you use most. Amounts in other currencies are calculated relative to
            it. You can change it later in Account Settings.
          </p>
          {saveCurrency.isError && (
            <p className="form-error" role="alert">
              Your currency could not be saved. Try again.
            </p>
          )}
          <button className="button primary" type="submit" disabled={saveCurrency.isPending}>
            {saveCurrency.isPending ? "Saving…" : "Confirm currency"}
          </button>
        </form>
      )}

      {view === "cash" && (
        <form className="auth-form" onSubmit={(event) => void confirmCash(event)} noValidate>
          <label htmlFor={amountId} className="onboarding-field">
            <span>Physical cash on hand</span>
            <span className="onboarding-amount">
              <span className="onboarding-symbol" aria-label={state.currency}>
                {symbol}
              </span>
              <input
                id={amountId}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                disabled={saveCash.isPending}
                aria-invalid={amountError ? true : undefined}
                aria-describedby={`${amountId}-help`}
                onChange={(event) => setAmount(event.target.value)}
              />
            </span>
          </label>
          <p id={`${amountId}-help`} className="onboarding-help">
            How much physical cash do you have right now? This becomes the opening balance of your
            Cash account. Enter 0 if you have none.
          </p>
          {amountError && (
            <p className="form-error" role="alert">
              {amountError}
            </p>
          )}
          {saveCash.isError && !amountError && (
            <p className="form-error" role="alert">
              Your cash balance could not be saved. Try again.
            </p>
          )}
          <div className="onboarding-actions">
            <button
              className="button secondary"
              type="button"
              disabled={saveCash.isPending}
              onClick={() => setSteppedBack(true)}
            >
              Back
            </button>
            <button className="button primary" type="submit" disabled={saveCash.isPending}>
              {saveCash.isPending ? "Saving…" : "Confirm cash balance"}
            </button>
          </div>
        </form>
      )}

      {view === "complete" && (
        <div className="auth-form">
          <p className="onboarding-help" role="status">
            Your Cash account is ready to use. You can add more accounts from the dashboard.
            {openingBalanceSkipped &&
              " Your cash amount was not added to the Cash account. You can adjust the balance from the dashboard."}
          </p>
          <button className="button primary" type="button" onClick={() => navigate("/app")}>
            Go to dashboard
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
