import {
  currencies,
  currencyMetadata,
  onboardingCashSchema,
  parseAmountToMinor,
  type Currency,
} from "@zoption/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { saveOnboardingCash, saveOnboardingCurrency } from "@/api/onboarding";
import { useSessionSnapshot } from "@/auth/session-state";
import { localIsoDate } from "@/features/dashboard/dashboard-view";
import { useSyncState } from "@/sync/sync-state";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { Button, FormField, SelectionField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

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

/**
 * First-run setup, the same two steps as the web app: base currency, then cash on hand. Both
 * need a connection and answer on the Worker, which owns the step. Not now just leaves; the
 * screen is offered again on the next launch until the cash step completes.
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

  if (!state || state.step === "complete") {
    return (
      <Screen title="You're all set">
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Your workspace is ready.
        </Text>
        <Button onPress={() => router.back()}>Continue</Button>
      </Screen>
    );
  }

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

  if (state.step === "currency") {
    const currency = picked ?? state.currency;
    const saveCurrency = () =>
      run(async (accessToken) => {
        const next = await saveOnboardingCurrency({ accessToken }, { currency });
        setCurrency(next.currency);
        setState(next);
      });
    return (
      <Screen title="Choose your currency">
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Budgets, goals, and totals show in this currency. Step 1 of 2.
        </Text>
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
      </Screen>
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
      setState({ step: result.step, currency: result.currency });
      // The opening entry is booked on the Worker, so pull it to this device.
      sync.retry();
      router.back();
    });
  };
  return (
    <Screen title="How much cash do you have?">
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        Physical cash on hand in {currencyMetadata[state.currency].label}. Enter 0 if you have none.
        Step 2 of 2.
      </Text>
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
        Finish setup
      </Button>
      {notNow}
    </Screen>
  );
}
