import {
  currencies,
  currencyMetadata,
  hasMoneyPreferences,
  onboardingCashSchema,
  parseAmountToMinor,
  suggestCurrencyForLocale,
  type Currency,
} from "@zoption/shared";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";

import { ApiTransportError } from "@/api/authenticated";
import { getOnboardingState, saveOnboardingCash, saveOnboardingCurrency } from "@/api/onboarding";
import { useSessionSnapshot } from "@/auth/session-state";
import { localIsoDate } from "@/features/dashboard/dashboard-view";
import { useSyncState } from "@/sync/sync-state";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { usePetStore } from "@/stores/pet-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { telemetry } from "@/telemetry/telemetry";
import { Button, FormField, SelectionField } from "@/ui/components";
import { formatMoneyMinor } from "@/ui/components/MoneyValue";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { SetupDialog } from "./SetupDialog";
import {
  canPickEgg,
  EggStep,
  FinalStep,
  GoalsStep,
  PersonalizeStep,
  PreferencesStep,
  SavedStep,
} from "./SetupSteps";

/** Blank input means zero cash; malformed or out-of-range input returns an inline message. */
function checkAmount(value: string): { error: string } | { amountMinor: number } {
  if (!value.trim()) return { amountMinor: 0 };
  let amountMinor: number;
  try {
    amountMinor = parseAmountToMinor(value);
  } catch {
    return { error: "Enter a number with no more than two decimal places." };
  }
  const parsed = onboardingCashSchema.safeParse({ amountMinor, date: localIsoDate(new Date()) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the amount." };
  return { amountMinor };
}

function deviceLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

type SetupStep = "currency" | "cash" | "goals" | "preferences" | "personalize" | "egg";

/**
 * First-run setup as one modal over Home (aligned with web): base currency, cash on hand, goals
 * (when unset), money habits (when unset), then Make it yours (theme + streak pet, plus egg picker
 * after a yes). Currency and cash need a connection and answer on the Worker; Not now leaves, and
 * Home offers a quick resume card until cash completes.
 */
export function OnboardingScreen() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const sync = useSyncState();
  const state = useOnboardingStore((store) => store.state);
  const setState = useOnboardingStore((store) => store.setState);
  const setCurrency = useWorkspaceCurrencyStore((store) => store.setCurrency);
  const [picked, setPicked] = useState<Currency>();
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The Worker's finished state, held back until setup closes so Home's goal and pet prompts
  // cannot push a page over setup while it is still open. Ref mirrors it so an unmount (such as
  // Android Back during post-cash steps) still commits completion instead of stranding Resume setup.
  const [finished, setFinished] = useState<typeof state>(null);
  const finishedRef = useRef<typeof state>(null);
  const closedNormallyRef = useRef(false);
  const mountedRef = useRef(true);
  const getAccessTokenRef = useRef(session.getAccessToken);
  getAccessTokenRef.current = session.getAccessToken;
  const syncRetryRef = useRef(sync.retry);
  syncRetryRef.current = sync.retry;
  const [local, setLocal] = useState<SetupStep>("personalize");
  // The Worker takes a new currency until the cash is saved, so step 2 can return to step 1.
  const [editingCurrency, setEditingCurrency] = useState(false);
  const [savedCashMinor, setSavedCashMinor] = useState(0);
  const [wantsPet, setWantsPet] = useState(true);
  // Fixed when the personalize step is left, so choosing the egg does not renumber the track.
  const [withEgg, setWithEgg] = useState(false);
  const pet = usePetStore((store) => store.pet);
  const profile = useGoalProfileStore((store) => store.profile);
  const preferences = useGoalProfileStore((store) => store.preferences);
  // Computed before cash finishes (reactively if profile/preferences arrive late) and frozen once
  // entering post-cash steps so saving goals/preferences never renumbers the track under the user.
  const [postCashFlags, setPostCashFlags] = useState<{ goals: boolean; preferences: boolean }>();
  const askGoals =
    postCashFlags?.goals ?? Boolean(profile && profile.goals.length === 0 && !profile.skipped);
  const askPreferences =
    postCashFlags?.preferences ?? (preferences !== null && !hasMoneyPreferences(preferences));

  // Other first-launch prompts (usage analytics, daily reminder permission) wait while setup is open.
  useEffect(() => {
    mountedRef.current = true;
    const store = useOnboardingStore.getState();
    const shouldRefreshOnResume =
      store.dismissed && store.state !== null && store.state.step !== "complete";
    store.setOpen(true);
    if (store.state && store.state.step !== "complete" && !store.dismissed) {
      void telemetry.capture("onboarding_started");
    }

    // Re-check Worker state when reopening via Resume setup so completing on web or another
    // device closes cleanly instead of submitting into 409 onboarding_complete.
    const controller = new AbortController();
    if (shouldRefreshOnResume) {
      void (async () => {
        try {
          const accessToken = await getAccessTokenRef.current(false);
          if (controller.signal.aborted || finishedRef.current) return;
          const latest = await getOnboardingState({ accessToken, signal: controller.signal });
          if (controller.signal.aborted || finishedRef.current) return;
          useWorkspaceCurrencyStore.getState().setCurrency(latest.currency);
          useOnboardingStore.getState().setState(latest);
          if (latest.step === "complete") {
            syncRetryRef.current();
            if (mountedRef.current) router.back();
          }
        } catch {
          // Offline or unreachable: stay on the cached step until the user submits or cancels.
        }
      })();
    }

    return () => {
      mountedRef.current = false;
      controller.abort();
      if (finishedRef.current) {
        if (!closedNormallyRef.current) {
          // Exiting post-cash steps via Android Back should land on Home without immediately
          // ambushing the user with the standalone goal or pet prompt modals.
          useGoalProfileStore.getState().markPrompted();
          usePetStore.getState().markIntroduced();
        }
        useOnboardingStore.getState().setState(finishedRef.current);
      }
      useOnboardingStore.getState().setOpen(false);
    };
  }, []);

  const steps: SetupStep[] = ["currency", "cash"];
  if (askGoals) steps.push("goals");
  if (askPreferences) steps.push("preferences");
  steps.push("personalize");
  const beforeEgg = local !== "egg";
  if (beforeEgg ? wantsPet && canPickEgg(pet) : withEgg) steps.push("egg");

  const completeAndClose = () => {
    closedNormallyRef.current = true;
    void telemetry.capture("onboarding_completed");
    if (finishedRef.current) setState(finishedRef.current);
    router.back();
  };

  // The egg step stays behind once an egg is chosen, since the Worker takes one egg.
  const backTo = (index: number) => {
    const target = steps[index];
    if (!target) return;
    if (!finished) {
      if (target === "currency") setEditingCurrency(true);
      return;
    }
    setLocal(target === "egg" && !canPickEgg(pet) ? "personalize" : target);
  };
  const progressAt = (step: SetupStep) => ({
    current: steps.indexOf(step),
    count: steps.length,
    backFrom: 0,
    onBack: backTo,
  });
  const advanceFrom = (step: SetupStep) => {
    const nextStep = steps[steps.indexOf(step) + 1];
    if (!nextStep) {
      completeAndClose();
      return;
    }
    setLocal(nextStep);
  };

  if (finished) {
    const progress = progressAt(local);
    if (local === "currency") {
      return (
        <SavedStep
          progress={progress}
          title="Your currency"
          value={currencyMetadata[finished.currency].label}
          note="Saved. You can change it anytime in More, under Currency."
          onNext={() => advanceFrom("currency")}
        />
      );
    }
    if (local === "cash") {
      return (
        <SavedStep
          progress={progress}
          title="Your cash on hand"
          value={formatMoneyMinor(savedCashMinor, finished.currency)}
          note="Saved as your Cash balance. To change it, open Cash from Home and adjust the balance."
          onNext={() => advanceFrom("cash")}
        />
      );
    }
    if (local === "goals") {
      return (
        <GoalsStep
          progress={progress}
          currency={finished.currency}
          onNext={() => advanceFrom("goals")}
        />
      );
    }
    if (local === "preferences") {
      return (
        <PreferencesStep
          progress={progress}
          currency={finished.currency}
          onNext={() => advanceFrom("preferences")}
        />
      );
    }
    if (local === "personalize") {
      return (
        <PersonalizeStep
          progress={progress}
          wantsPet={wantsPet}
          onWantsPet={setWantsPet}
          onNext={() => {
            const eggNext = wantsPet && canPickEgg(pet);
            setWithEgg(eggNext);
            if (eggNext) setLocal("egg");
            else completeAndClose();
          }}
        />
      );
    }
    return <EggStep progress={progress} onNext={completeAndClose} />;
  }

  if (!state || state.step === "complete") return <FinalStep onDone={() => router.back()} />;

  const reconcileConflict = async (
    accessToken: string,
    fallbackComplete: boolean,
  ): Promise<boolean> => {
    let latest = null;
    try {
      latest = await getOnboardingState({ accessToken });
    } catch {
      if (fallbackComplete) {
        latest = { step: "complete" as const, currency: state.currency };
      }
    }
    if (!latest) return false;
    setCurrency(latest.currency);
    setState(latest);
    setEditingCurrency(false);
    if (latest.step === "complete") {
      sync.retry();
      if (mountedRef.current) router.back();
    }
    return true;
  };

  const run = async (request: (accessToken: string) => Promise<void>) => {
    setBusy(true);
    setError(null);
    let accessToken: string | null = null;
    try {
      accessToken = await session.getAccessToken(false);
      await request(accessToken);
    } catch (failure) {
      if (
        accessToken &&
        failure instanceof ApiTransportError &&
        failure.status === 409 &&
        (failure.serverCode === "onboarding_complete" ||
          failure.serverCode === "onboarding_step_out_of_order")
      ) {
        if (await reconcileConflict(accessToken, failure.serverCode === "onboarding_complete")) {
          return;
        }
      }
      if (mountedRef.current) {
        setError(failure instanceof Error ? failure.message : "Your setup could not be saved.");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const dismiss = () => {
    void telemetry.capture("onboarding_dismissed", {
      step: state.step === "currency" || editingCurrency ? "currency" : "cash",
    });
    router.back();
  };

  const notNow = (
    <Button variant="secondary" disabled={busy} onPress={dismiss}>
      Not now
    </Button>
  );
  const failure = error ? (
    <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.danger }]}>
      {error}
    </Text>
  ) : null;

  if (state.step === "currency" || editingCurrency) {
    const initialCurrency =
      !editingCurrency && state.step === "currency" && state.currency === "PHP"
        ? suggestCurrencyForLocale(deviceLocale())
        : state.currency;
    const currency = picked ?? initialCurrency;
    const saveCurrency = () =>
      run(async (accessToken) => {
        const next = await saveOnboardingCurrency({ accessToken }, { currency });
        setCurrency(next.currency);
        setState(next);
        setEditingCurrency(false);
        void telemetry.capture("onboarding_step_completed", { step: "currency" });
      });
    return (
      <SetupDialog
        progress={progressAt("currency")}
        title="Choose your currency"
        description="Budgets, goals, and totals show in this currency."
      >
        <SelectionField
          label="Base currency"
          value={currency}
          options={currencies.map((item) => ({ id: item, label: currencyMetadata[item].label }))}
          placeholder="Choose a currency"
          sheetTitle="Base currency"
          disabled={busy}
          onSelect={(value) => setPicked(currencies.find((item) => item === value))}
        />
        {failure}
        <Button loading={busy} disabled={busy} onPress={() => void saveCurrency()}>
          Continue
        </Button>
        {notNow}
      </SetupDialog>
    );
  }

  const saveCash = () => {
    const checked = checkAmount(cash);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    void run(async (accessToken) => {
      const result = await saveOnboardingCash(
        { accessToken },
        { amountMinor: checked.amountMinor, date: localIsoDate(new Date()) },
      );
      void telemetry.capture("onboarding_step_completed", { step: "cash" });
      setCurrency(result.currency);
      setSavedCashMinor(checked.amountMinor);
      const flags = { goals: askGoals, preferences: askPreferences };
      setPostCashFlags(flags);
      setLocal(flags.goals ? "goals" : flags.preferences ? "preferences" : "personalize");
      const nextFinished = { step: result.step, currency: result.currency };
      finishedRef.current = nextFinished;
      setFinished(nextFinished);
      // The opening entry is booked on the Worker, so pull it to this device.
      sync.retry();
    });
  };
  return (
    <SetupDialog
      progress={progressAt("cash")}
      title="How much cash do you have?"
      description={`Physical cash on hand in ${currencyMetadata[state.currency].label}. Leave blank or enter 0 if you have none.`}
    >
      <FormField
        label="Cash on hand"
        value={cash}
        onChangeText={(value) => {
          setCash(value);
          setError(null);
        }}
        placeholder="0.00"
        inputMode="decimal"
        keyboardType="decimal-pad"
        editable={!busy}
      />
      {failure}
      <Button loading={busy} disabled={busy} onPress={saveCash}>
        Continue
      </Button>
      {notNow}
    </SetupDialog>
  );
}
