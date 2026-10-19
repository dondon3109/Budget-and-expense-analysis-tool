import {
  billingIntervals,
  PLAN_NAMES,
  type BillingInterval,
  type BillingPlanKey,
  type BillingProvider,
} from "@zoption/shared";
import { useState } from "react";
import { Text, View } from "react-native";

import type { PlanChoice } from "@/api/billing";
import { Button, SelectionField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { INTERVAL_LABELS, PLAN_PITCH, planPriceLabel } from "./billing-copy";
import type { CheckoutBusy } from "./use-plan-checkout";

interface PlanPickerProps {
  plans: readonly BillingPlanKey[];
  suggestedPlan: BillingPlanKey;
  /** The plan already paid for; the picker then switches it instead of starting a checkout. */
  current: PlanChoice | null;
  busy: CheckoutBusy | null;
  onCheckout: (choice: PlanChoice, provider: BillingProvider) => void;
  onChange: (choice: PlanChoice) => void;
}

/** Plan and interval choice, then Dodo or PayPal checkout, or a switch of the current plan. */
export function PlanPicker({
  plans,
  suggestedPlan,
  current,
  busy,
  onCheckout,
  onChange,
}: PlanPickerProps) {
  const theme = useZoptionTheme();
  const [plan, setPlan] = useState<BillingPlanKey>(suggestedPlan);
  const [interval, setIntervalChoice] = useState<BillingInterval>(current?.interval ?? "month");
  const choice = { plan, interval };
  const unchanged = current !== null && current.plan === plan && current.interval === interval;

  return (
    <View className="gap-3">
      <SelectionField
        label="Billing interval"
        value={interval}
        options={billingIntervals.map((id) => ({
          id,
          label: INTERVAL_LABELS[id],
          detail: id === "year" ? "2 months free" : undefined,
        }))}
        placeholder="Monthly"
        sheetTitle="Billing interval"
        onSelect={(value) => setIntervalChoice(value as BillingInterval)}
      />
      <SelectionField
        label="Plan"
        value={plan}
        options={plans.map((id) => ({
          id,
          label: PLAN_NAMES[id],
          detail: planPriceLabel(id, interval),
        }))}
        placeholder={PLAN_NAMES[suggestedPlan]}
        sheetTitle="Plan"
        onSelect={(value) => setPlan(value as BillingPlanKey)}
      />
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>{PLAN_PITCH[plan]}</Text>
      {current ? (
        <>
          <Button
            loading={busy === "change"}
            disabled={busy !== null || unchanged}
            onPress={() => onChange(choice)}
          >
            {unchanged ? "Current plan" : `Switch to ${PLAN_NAMES[plan]}`}
          </Button>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Upgrades start now. A smaller plan starts when the current paid period ends.
          </Text>
        </>
      ) : (
        <>
          <Button
            loading={busy === "dodo-checkout"}
            disabled={busy !== null}
            onPress={() => onCheckout(choice, "dodo")}
          >
            {`Continue with ${PLAN_NAMES[plan]}`}
          </Button>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Pay by card, Apple Pay, or Google Pay. Dodo Payments is the merchant of record for this
            option.
          </Text>
          <Button
            variant="secondary"
            loading={busy === "checkout"}
            disabled={busy !== null}
            onPress={() => onCheckout(choice, "paypal")}
          >
            Continue with PayPal
          </Button>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Checkout opens in your browser. The Zoption server verifies the payment before paid
            access starts.
          </Text>
        </>
      )}
    </View>
  );
}
