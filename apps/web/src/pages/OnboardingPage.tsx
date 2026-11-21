import {
  currencyMetadata,
  hasMoneyPreferences,
  onboardingCashSchema,
  parseAmountToMinor,
  suggestCurrencyForLocale,
  type Currency,
} from "@zoption/shared";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { captureFunnelEvent } from "../analytics/funnel";
import { useAuth } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";
import { FullPageLoadingStatus } from "../components/layout/FullPageLoadingStatus";
import { CurrencyPicker } from "../components/onboarding/CurrencyPicker";
import { GoalPicker } from "../components/onboarding/GoalPicker";
import { PersonalizeStep } from "../components/onboarding/PersonalizeStep";
import { PreferencesPicker } from "../components/onboarding/PreferencesPicker";
import { isApiRequestError } from "../lib/api";
import { userWorkspace, type AuthenticatedWorkspace } from "../lib/workspace";
import {
  useGoalProfile,
  useMarkGoalShown,
  useMoneyPreferences,
  useSaveGoals,
  useSaveMoneyPreferences,
  useSkipGoal,
} from "../queries/goalProfile";
import {
  useOnboarding,
  useSaveOnboardingCashBalance,
  useSaveOnboardingCurrency,
} from "../queries/onboarding";
import "./OnboardingPage.css";

const STEPS = [
  "Base currency",
  "Starting cash",
  "Your goal",
  "Your money habits",
  "Make it yours",
] as const;

type OnboardingView = "currency" | "cash" | "goal" | "preferences" | "complete";

const STEP_INDEX: Record<OnboardingView, number> = {
  currency: 0,
  cash: 1,
  goal: 2,
  preferences: 3,
  complete: 4,
};

/** The user's calendar day, which the server cannot know. */
function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Blank input means zero cash; malformed or out-of-range input returns an inline message. */
function checkAmount(value: string): { error: string } | { amountMinor: number } {
  if (!value.trim()) return { amountMinor: 0 };
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

function browserLocale(): string | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.language;
}

/**
 * Surfaces save errors instead of silently advancing; Skip always moves on so a flaky connection
 * cannot trap the user.
 */
function GoalStep({
  workspace,
  currency,
  onSaved,
  onSkipped,
}: {
  workspace: AuthenticatedWorkspace;
  currency: Currency;
  onSaved: () => void;
  onSkipped: () => void;
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
        currency={currency}
        disabled={saveGoal.isPending || skipGoal.isPending}
        confirmLabel="Continue"
        onChoose={(choice) => {
          saveGoal.mutate(choice, { onSuccess: onSaved });
        }}
      />
      {saveGoal.isError && (
        <p className="form-error" role="alert">
          Your goal could not be saved. Try again or skip for now.
        </p>
      )}
      <button
        className="button secondary"
        type="button"
        disabled={saveGoal.isPending || skipGoal.isPending}
        onClick={() => skipGoal.mutate(undefined, { onSettled: onSkipped })}
      >
        Skip
      </button>
    </div>
  );
}

/**
 * Pay cadence, budgeting style, and spending focus. Save failures stay on the step with an inline
 * error; Skip (or Continue with nothing picked) always moves on.
 */
function PreferencesStep({
  workspace,
  currency,
  onBack,
  onSaved,
  onSkipped,
}: {
  workspace: AuthenticatedWorkspace;
  currency: Currency;
  onBack?: () => void;
  onSaved: () => void;
  onSkipped: () => void;
}) {
  const save = useSaveMoneyPreferences(workspace);
  return (
    <div className="auth-form">
      <p className="onboarding-help">
        Zoption uses these to suggest your first steps and tailor what the AI asks about. Answer any
        you like.
      </p>
      <PreferencesPicker
        preferences={{ incomeCadence: null, budgetingStyle: null, spendingFocus: [] }}
        currency={currency}
        disabled={save.isPending}
        confirmLabel="Continue"
        onSave={(preferences) => {
          if (!hasMoneyPreferences(preferences)) {
            onSkipped();
            return;
          }
          save.mutate(preferences, { onSuccess: onSaved });
        }}
      />
      {save.isError && (
        <p className="form-error" role="alert">
          Your money habits could not be saved. Try again or skip for now.
        </p>
      )}
      <div className="onboarding-actions">
        {onBack && (
          <button
            className="button secondary"
            type="button"
            disabled={save.isPending}
            onClick={onBack}
          >
            Back
          </button>
        )}
        <button
          className="button secondary"
          type="button"
          disabled={save.isPending}
          onClick={onSkipped}
        >
          Skip
        </button>
      </div>
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
  const preferencesQuery = useMoneyPreferences(workspace);
  const saveCurrency = useSaveOnboardingCurrency(workspace);
  const saveCash = useSaveOnboardingCashBalance(workspace);
  const currencyId = useId();
  const amountId = useId();
  // Local only: a pick not yet confirmed, the typed amount, and post-cash step progression.
  const [pickedCurrency, setPickedCurrency] = useState<Currency>();
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [steppedBack, setSteppedBack] = useState(false);
  const [finished, setFinished] = useState(false);
  const [postCashStep, setPostCashStep] = useState<"goal" | "preferences" | "complete">("complete");
  const [canReturnToGoal, setCanReturnToGoal] = useState(false);
  const [canReturnToPreferences, setCanReturnToPreferences] = useState(false);
  const [openingBalanceSkipped, setOpeningBalanceSkipped] = useState(false);

  const shouldTrackStart = stateQuery.data !== undefined && stateQuery.data.step !== "complete";
  useEffect(() => {
    if (shouldTrackStart) captureFunnelEvent("onboarding_started", {});
  }, [shouldTrackStart]);

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

  const needsGoal = goalQuery.isSuccess && goalQuery.data.goal === null && !goalQuery.data.skipped;
  const needsPreferences =
    preferencesQuery.isSuccess && !hasMoneyPreferences(preferencesQuery.data);

  const view: OnboardingView = finished
    ? postCashStep
    : steppedBack
      ? "currency"
      : state.step === "complete"
        ? "cash"
        : state.step;

  // Suggest a locale currency only on a fresh currency step before the user picks one.
  const initialCurrency =
    !steppedBack && state.step === "currency" && state.currency === "PHP"
      ? suggestCurrencyForLocale(browserLocale())
      : state.currency;
  const selected = pickedCurrency ?? initialCurrency;
  const { symbol } = currencyMetadata[state.currency];
  const amountCheck = checkAmount(amount);
  const amountError = submitted && "error" in amountCheck ? amountCheck.error : undefined;

  function enterPostCashFlow() {
    setFinished(true);
    setCanReturnToGoal(needsGoal);
    setCanReturnToPreferences(needsPreferences);
    if (needsGoal) setPostCashStep("goal");
    else if (needsPreferences) setPostCashStep("preferences");
    else setPostCashStep("complete");
  }

  async function confirmCurrency(event: FormEvent) {
    event.preventDefault();
    try {
      await saveCurrency.mutateAsync({ currency: selected });
      captureFunnelEvent("onboarding_step_completed", { step: "currency" });
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
      captureFunnelEvent("onboarding_step_completed", { step: "cash" });
      setOpeningBalanceSkipped(amountCheck.amountMinor > 0 && !result.openingBalanceBooked);
      enterPostCashFlow();
    } catch (error) {
      // A repeat submit after a success already created the account; the state is complete.
      if (isApiRequestError(error) && error.code === "onboarding_complete") enterPostCashFlow();
    }
  }

  function advanceFromGoal(skipped: boolean) {
    captureFunnelEvent(skipped ? "onboarding_step_skipped" : "onboarding_step_completed", {
      step: "goal",
    });
    setPostCashStep(canReturnToPreferences ? "preferences" : "complete");
  }

  function advanceFromPreferences(skipped: boolean) {
    captureFunnelEvent(skipped ? "onboarding_step_skipped" : "onboarding_step_completed", {
      step: "preferences",
    });
    setPostCashStep("complete");
  }

  function finishSetup(wantsPet: boolean) {
    captureFunnelEvent("onboarding_step_completed", { step: "personalize" });
    captureFunnelEvent("onboarding_completed", {});
    void navigate(wantsPet ? "/app/pet?from=onboarding" : "/app");
  }

  return (
    <AuthLayout
      eyebrow="Welcome to Zoption"
      title={
        view === "currency"
          ? "Choose your base currency"
          : view === "cash"
            ? "How much cash do you have?"
            : view === "goal"
              ? "What brings you to Zoption?"
              : view === "preferences"
                ? "How do you manage money?"
                : "Make it yours"
      }
      description={
        view === "complete"
          ? "Pick a look and decide if a streak pet should cheer you on. You can change both anytime."
          : "A few quick questions, then you can start tracking."
      }
    >
      <Stepper current={STEP_INDEX[view]} />

      {view === "currency" && (
        <form className="auth-form" onSubmit={(event) => void confirmCurrency(event)}>
          <CurrencyPicker
            value={selected}
            disabled={saveCurrency.isPending}
            describedBy={`${currencyId}-help`}
            onChange={setPickedCurrency}
          />
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
                placeholder="0.00"
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
            Cash account. Leave blank or enter 0 if you have none.
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

      {view === "goal" && (
        <GoalStep
          workspace={workspace}
          currency={state.currency}
          onSaved={() => advanceFromGoal(false)}
          onSkipped={() => advanceFromGoal(true)}
        />
      )}

      {view === "preferences" && (
        <PreferencesStep
          workspace={workspace}
          currency={state.currency}
          onBack={canReturnToGoal ? () => setPostCashStep("goal") : undefined}
          onSaved={() => advanceFromPreferences(false)}
          onSkipped={() => advanceFromPreferences(true)}
        />
      )}

      {view === "complete" && (
        <>
          <p className="onboarding-help" role="status">
            Your Cash account is ready to use. You can add more accounts from the dashboard.
            {openingBalanceSkipped &&
              " Your cash amount was not added to the Cash account. You can adjust the balance from the dashboard."}
          </p>
          <PersonalizeStep workspace={workspace} onDone={finishSetup} />
          {(canReturnToPreferences || canReturnToGoal) && (
            <button
              className="button secondary"
              type="button"
              onClick={() => setPostCashStep(canReturnToPreferences ? "preferences" : "goal")}
            >
              Back
            </button>
          )}
        </>
      )}
    </AuthLayout>
  );
}
