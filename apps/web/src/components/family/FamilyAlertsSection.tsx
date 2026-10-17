import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  familyAlertSettingsSchema,
  formatMinorAmount,
  parseAmountToMinor,
  type Currency,
  type FamilyAlertSettings,
} from "@zoption/shared";
import { useState, type FormEvent } from "react";

import { saveFamilyAlertSettings } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useWorkspaceCurrency } from "../../lib/workspaceCurrency";
import { useFamilyAlertSettings } from "../../queries/family-comments";

/** Blank turns the alert off; anything else must be a positive amount. */
function readThreshold(text: string): number | null | undefined {
  if (!text.trim()) return null;
  try {
    const value = parseAmountToMinor(text);
    return value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function describe(amountMinor: number | null, currency: Currency): string {
  return amountMinor === null ? "off" : formatMoney(amountMinor, currency);
}

/**
 * The family's alert thresholds. Everyone sees them; the owner changes them. Each member still
 * turns a category off for themselves in their notification settings.
 */
export function FamilyAlertsSection({
  family,
  canManage,
}: {
  family: AuthenticatedWorkspace;
  canManage: boolean;
}) {
  const settings = useFamilyAlertSettings(family).data;
  const currency = useWorkspaceCurrency();
  if (!settings) return null;
  return (
    <section className="family-section" aria-labelledby="family-alerts-title">
      <h2 id="family-alerts-title">Alerts</h2>
      {canManage ? (
        // Keyed by the saved values so the inputs start over from what the server kept.
        <AlertsForm
          key={`${settings.spendingAlertMinor}:${settings.lowBalanceMinor}`}
          family={family}
          settings={settings}
        />
      ) : (
        <p className="family-muted">
          The owner hears about one expense of {describe(settings.spendingAlertMinor, currency)} or
          more, and everyone hears when money left drops below{" "}
          {describe(settings.lowBalanceMinor, currency)}.
        </p>
      )}
    </section>
  );
}

function AlertsForm({
  family,
  settings,
}: {
  family: AuthenticatedWorkspace;
  settings: FamilyAlertSettings;
}) {
  const queryClient = useQueryClient();
  const initial = (value: number | null) => (value === null ? "" : formatMinorAmount(value));
  const [spending, setSpending] = useState(initial(settings.spendingAlertMinor));
  const [lowBalance, setLowBalance] = useState(initial(settings.lowBalanceMinor));
  const save = useMutation({
    mutationFn: (next: FamilyAlertSettings) => saveFamilyAlertSettings(family, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.familyAlerts(family) }),
  });
  const parsed = familyAlertSettingsSchema.safeParse({
    spendingAlertMinor: readThreshold(spending),
    lowBalanceMinor: readThreshold(lowBalance),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed.success) save.mutate(parsed.data);
  }

  return (
    <>
      <p className="family-muted">
        You hear about any one expense of the first amount or more. Everyone hears when the money
        left drops below the second. Leave one blank to turn it off.
      </p>
      <form className="family-inline-form" onSubmit={submit} noValidate>
        <label>
          <span>Large expense</span>
          <input
            inputMode="decimal"
            value={spending}
            onChange={(event) => setSpending(event.target.value)}
            aria-invalid={readThreshold(spending) === undefined}
          />
        </label>
        <label>
          <span>Low balance</span>
          <input
            inputMode="decimal"
            value={lowBalance}
            onChange={(event) => setLowBalance(event.target.value)}
            aria-invalid={readThreshold(lowBalance) === undefined}
          />
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={save.isPending || !parsed.success}
        >
          Save alerts
        </button>
      </form>
      {save.error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
    </>
  );
}
