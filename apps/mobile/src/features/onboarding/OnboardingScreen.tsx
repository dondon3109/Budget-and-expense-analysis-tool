import {
  currencies,
  currencyMetadata,
  onboardingCashSchema,
  parseAmountToMinor,
  type Currency,
} from "@zoption/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { saveOnboardingCash, saveOnboardingCurrency } from "@/api/onboarding";
import { useSessionSnapshot } from "@/auth/session-state";
import { localIsoDate } from "@/features/dashboard/dashboard-view";
import { useSyncState } from "@/sync/sync-state";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { usePetStore } from "@/stores/pet-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
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
  PetStep,
  SavedStep,
  ThemeStep,
} from "./SetupSteps";

/** The message for the amount field, or the parsed minor units when it is valid. */
function checkAmount(value: string): { error: string } | { amountMinor: number } {
  if (!value.trim()) return { error: "Enter the cash you have on hand, or 0." };
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

type SetupStep = "currency" | "cash" | "theme" | "pet" | "egg" | "goals" | "final";

/**
 * First-run setup as one modal over Home: base currency, cash on hand, theme, streak pet (and its
 * egg after a yes), the goals when none were chosen yet, then a closing thank-you, with the step
 * track under the card.
 * Currency and cash need a connection and answer on the Worker, which owns them; Not now just
 * leaves, and setup is offered again on the next launch until the cash step completes. Every done
 * number on the track goes back to its step; once the cash is saved the Worker locks both, so
 * those two show what was saved and where to change it.
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
  // The Worker's finished state, held back until Final closes so Home's goal and pet prompts
  // cannot push a page over setup while it is still open.
  const [finished, setFinished] = useState<typeof state>(null);
  const [local, setLocal] = useState<SetupStep>("theme");
  // The Worker takes a new currency until the cash is saved, so step 2 can return to step 1.
  const [editingCurrency, setEditingCurrency] = useState(false);
  const [savedCashMinor, setSavedCashMinor] = useState(0);
  const [wantsPet, setWantsPet] = useState(true);
  // Fixed when the pet step is left, so choosing the egg does not renumber the track.
  const [withEgg, setWithEgg] = useState(false);
  const pet = usePetStore((store) => store.pet);
  // Fixed at open, so saving the goals does not renumber the track under the user.
  const [askGoals] = useState(() => {
    const profile = useGoalProfileStore.getState().profile;
    return Boolean(profile && profile.goals.length === 0 && !profile.skipped);
  });

  // Other first-launch prompts (usage analytics) wait while setup is on screen.
  useEffect(() => {
    useOnboardingStore.getState().setOpen(true);
    return () => useOnboardingStore.getState().setOpen(false);
  }, []);

  const steps: SetupStep[] = ["currency", "cash", "theme", "pet"];
  const beforePet = local === "theme" || local === "pet";
  if (beforePet ? wantsPet && canPickEgg(pet) : withEgg) steps.push("egg");
  if (askGoals) steps.push("goals");
  steps.push("final");
  // The egg step stays behind once an egg is chosen, since the Worker takes one egg.
  const backTo = (index: number) => {
    const target = steps[index];
    if (!target || target === "final") return;
    if (!finished) {
      if (target === "currency") setEditingCurrency(true);
      return;
    }
    setLocal(target === "egg" && !canPickEgg(pet) ? "pet" : target);
  };
  const progressAt = (step: SetupStep) => ({
    current: steps.indexOf(step),
    count: steps.length,
    backFrom: 0,
    onBack: backTo,
  });
  const next = () => setLocal((current) => steps[steps.indexOf(current) + 1] ?? "final");

  if (finished) {
    const progress = progressAt(local);
    if (local === "currency") {
      return (
        <SavedStep
          progress={progress}
          title="Your currency"
          value={currencyMetadata[finished.currency].label}
          note="Saved. You can change it anytime in More, under Currency."
          onNext={next}
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
          onNext={next}
        />
      );
    }
    if (local === "theme") return <ThemeStep progress={progress} onNext={next} />;
    if (local === "pet") {
      return (
        <PetStep
          progress={progress}
          wantsPet={wantsPet}
          onWantsPet={setWantsPet}
          onNext={() => {
            setWithEgg(steps.includes("egg"));
            next();
          }}
        />
      );
    }
    if (local === "egg") return <EggStep progress={progress} onNext={next} />;
    if (local === "goals") return <GoalsStep progress={progress} onNext={next} />;
    return (
      <FinalStep
        progress={progress}
        onDone={() => {
          setState(finished);
          router.back();
        }}
      />
    );
  }

  if (!state || state.step === "complete") return <FinalStep onDone={() => router.back()} />;

  const run = async (request: (accessToken: string) => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await request(await session.getAccessToken(false));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your setup could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const notNow = (
    <Button variant="secondary" disabled={busy} onPress={() => router.back()}>
      Not now
    </Button>
  );
  const failure = error ? (
    <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.danger }]}>
      {error}
    </Text>
  ) : null;

  if (state.step === "currency" || editingCurrency) {
    const currency = picked ?? state.currency;
    const saveCurrency = () =>
      run(async (accessToken) => {
        const next = await saveOnboardingCurrency({ accessToken }, { currency });
        setCurrency(next.currency);
        setState(next);
        setEditingCurrency(false);
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
      setSavedCashMinor(checked.amountMinor);
      setFinished({ step: result.step, currency: result.currency });
      // The opening entry is booked on the Worker, so pull it to this device.
      sync.retry();
    });
  };
  return (
    <SetupDialog
      progress={progressAt("cash")}
      title="How much cash do you have?"
      description={`Physical cash on hand in ${currencyMetadata[state.currency].label}. Enter 0 if you have none.`}
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
