import { useNetInfo } from "@react-native-community/netinfo";
import { currencies, currencyMetadata, type Currency } from "@zoption/shared";
import { useState } from "react";
import { Text } from "react-native";

import { updateWorkspaceSettings } from "@/api/workspace-settings";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { CollapsibleCard, SelectionField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

/** Workspace currency picker, shared with the web; saving it needs a connection. */
export function WorkspaceCurrencyCard() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const netInfo = useNetInfo();
  const currency = useWorkspaceCurrencyStore((state) => state.currency);
  const setCurrency = useWorkspaceCurrencyStore((state) => state.setCurrency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offline = (netInfo.isInternetReachable ?? netInfo.isConnected) === false;
  const demo = isDummyDevelopmentSubject(session.subject);

  const select = async (value: string) => {
    const next = currencies.find((item) => item === value);
    if (!next || next === currency) return;
    setSaving(true);
    setError(null);
    try {
      const settings = await updateWorkspaceSettings(
        { accessToken: await session.getAccessToken(false) },
        { currency: next satisfies Currency },
      );
      setCurrency(settings.currency);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The currency could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsibleCard
      title="Currency"
      summary={currencyMetadata[currency].label}
      icon="cash-multiple"
    >
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Budgets, goals, debts, and totals show in this currency on every device, and new accounts
        start in it. Changing it relabels amounts; stored amounts are not converted.
      </Text>
      <SelectionField
        label="Workspace currency"
        value={currency}
        options={currencies.map((item) => ({ id: item, label: currencyMetadata[item].label }))}
        placeholder="Choose a currency"
        sheetTitle="Workspace currency"
        disabled={saving || offline || demo}
        hint={
          demo
            ? "Not available in the demo workspace."
            : offline
              ? "Connect to the internet to change the currency."
              : undefined
        }
        onSelect={(value) => void select(value)}
      />
      {error ? (
        <Text style={[typography.caption, { color: theme.colors.danger }]}>{error}</Text>
      ) : null}
    </CollapsibleCard>
  );
}
