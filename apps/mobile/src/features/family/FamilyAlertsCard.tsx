import {
  familyAlertSettingsSchema,
  formatMinorAmount,
  parseAmountToMinor,
  type FamilyAlertSettings,
} from "@zoption/shared";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { getFamilyAlertSettings, saveFamilyAlertSettings } from "@/api/family";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { Button, Card, FormField, formatMoneyMinor } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useFamilyApi } from "./use-family-api";

/** Blank turns the alert off; anything else must be a positive amount (undefined when not). */
export function readThreshold(text: string): number | null | undefined {
  if (!text.trim()) return null;
  try {
    const value = parseAmountToMinor(text);
    return value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

const asInput = (value: number | null) => (value === null ? "" : formatMinorAmount(value));

/**
 * The family's alert thresholds. Everyone sees them; the owner changes them. Each member still
 * turns a category off for themselves in their notification settings.
 */
export function FamilyAlertsCard({ canManage }: { canManage: boolean }) {
  const theme = useZoptionTheme();
  const currency = useWorkspaceCurrency();
  const familyApi = useFamilyApi();
  const [settings, setSettings] = useState<FamilyAlertSettings | null>(null);
  const [spending, setSpending] = useState("");
  const [lowBalance, setLowBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!familyApi) return;
    let live = true;
    void familyApi(getFamilyAlertSettings)
      .then((loaded) => {
        if (!live) return;
        setSettings(loaded);
        setSpending(asInput(loaded.spendingAlertMinor));
        setLowBalance(asInput(loaded.lowBalanceMinor));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [familyApi]);

  if (!familyApi || !settings) return null;
  const muted = { color: theme.colors.textMuted };
  const describe = (value: number | null) =>
    value === null ? "off" : formatMoneyMinor(value, currency);
  const parsed = familyAlertSettingsSchema.safeParse({
    spendingAlertMinor: readThreshold(spending),
    lowBalanceMinor: readThreshold(lowBalance),
  });

  const save = async () => {
    if (!parsed.success || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      setSettings(await familyApi((api) => saveFamilyAlertSettings(api, parsed.data)));
      setMessage("Alerts saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The alerts could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={[typography.headline, { color: theme.colors.text }]}>Alerts</Text>
      {canManage ? (
        <>
          <Text style={[typography.callout, muted]}>
            You hear about any one expense of the first amount or more. Everyone hears when the
            money left drops below the second. Leave one blank to turn it off.
          </Text>
          <FormField
            error={
              readThreshold(spending) === undefined
                ? "Enter an amount, or leave it blank."
                : undefined
            }
            keyboardType="decimal-pad"
            label="Large expense"
            onChangeText={setSpending}
            value={spending}
          />
          <FormField
            error={
              readThreshold(lowBalance) === undefined
                ? "Enter an amount, or leave it blank."
                : undefined
            }
            keyboardType="decimal-pad"
            label="Low balance"
            onChangeText={setLowBalance}
            value={lowBalance}
          />
          <Button disabled={!parsed.success} loading={saving} onPress={() => void save()}>
            Save alerts
          </Button>
          {message ? <Text style={[typography.callout, muted]}>{message}</Text> : null}
        </>
      ) : (
        <Text style={[typography.callout, muted]}>
          The owner hears about one expense of {describe(settings.spendingAlertMinor)} or more, and
          everyone hears when money left drops below {describe(settings.lowBalanceMinor)}.
        </Text>
      )}
    </Card>
  );
}
