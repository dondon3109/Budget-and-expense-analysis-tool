import {
  currencies,
  currencyMetadata,
  onboardingCashSchema,
  parseAmountToMinor,
  type Currency,
} from "@zoption/shared";
import { useId, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";
import { FullPageLoadingStatus } from "../components/layout/FullPageLoadingStatus";
import { isApiRequestError } from "../lib/api";
import { userWorkspace } from "../lib/workspace";
import {
  useOnboarding,
  useSaveOnboardingCashBalance,
  useSaveOnboardingCurrency,
} from "../queries/onboarding";
import "./OnboardingPage.css";

const STEPS = ["Base currency", "Starting cash", "All set"] as const;

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
            <span>
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

  if (stateQuery.isPending)
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
      </AuthLayout>
    );
  }

  const state = stateQuery.data;
  // A finished workspace has nothing to set up, unless the user just finished it here.
  if (state.step === "complete" && !finished) return <Navigate to="/app" replace />;

  const view = finished ? "complete" : steppedBack ? "currency" : state.step;
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
      await saveCash.mutateAsync({ amountMinor: amountCheck.amountMinor, date: localDate() });
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
        view === "currency"
          ? "Choose your base currency"
          : view === "cash"
            ? "How much cash do you have?"
            : "Your first account is ready"
      }
      description={
        view === "complete"
          ? "Your workspace is set up."
          : "Two quick questions, then you can start tracking."
      }
    >
      <Stepper current={view === "currency" ? 0 : view === "cash" ? 1 : 3} />

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
          </p>
          <button className="button primary" type="button" onClick={() => navigate("/app")}>
            Go to dashboard
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
