import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { personalBillingPlans, type BillingSummary } from "@zoption/shared";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ApiTransportError, cancelBillingSubscription, getBillingSummary } from "@/api/billing";
import { Button, Card, ConfirmationDialog, ErrorState, SkeletonLines } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, typography } from "@/ui/tokens";

import {
  entitlementCopy,
  pendingCheckoutCopy,
  periodEndsCopy,
  planName,
  planStatusCopy,
  usageResetsCopy,
  usageTitle,
} from "./billing-copy";
import { PlanPicker } from "./PlanPicker";
import { usePlanCheckout } from "./use-plan-checkout";

export function BillingScreen() {
  const theme = useZoptionTheme();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // A plan change settles without a summary, so bumping this reloads it.
  const [reloadToken, setReloadToken] = useState(0);
  const settled = useCallback((next: BillingSummary | null) => {
    if (next) setSummary(next);
    else setReloadToken((value) => value + 1);
  }, []);
  const { busy, setBusy, message, setMessage, withToken, checkout, change, checkPayment } =
    usePlanCheckout(null, settled);

  const load = useCallback(async () => {
    try {
      const next = await withToken((token) => getBillingSummary({ accessToken: token }));
      setSummary(next);
      setPhase("ready");
    } catch (error) {
      setLoadError(
        error instanceof ApiTransportError ? error.message : "Billing could not be loaded.",
      );
      setPhase("error");
    }
  }, [withToken]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const runCancel = useCallback(async () => {
    setConfirmingCancel(false);
    setBusy("cancel");
    setMessage(null);
    try {
      await withToken((token) => cancelBillingSubscription({ accessToken: token }));
      await load();
      setMessage("Renewal is off. Your plan stays until the end of the current period.");
    } catch (error) {
      setMessage(
        error instanceof ApiTransportError
          ? error.message
          : "The subscription could not be changed.",
      );
    } finally {
      setBusy(null);
    }
  }, [load, setBusy, setMessage, withToken]);

  if (phase === "loading") {
    return (
      <Screen hasHeader title="Plan and billing">
        <SkeletonLines lines={4} />
      </Screen>
    );
  }

  if (phase === "error" || summary === null) {
    return (
      <Screen hasHeader title="Plan and billing">
        <ErrorState
          title="Plan unavailable"
          message={loadError ?? "Billing could not be loaded."}
          onRetry={() => {
            setPhase("loading");
            void load();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      hasHeader
      title="Plan and billing"
      description="Limits are enforced by the Zoption server"
    >
      <Card accessibilityLabel="Current plan">
        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons
              name={summary.plan === "free" ? "wallet-outline" : "crown-outline"}
              size={20}
              color={summary.plan === "free" ? theme.colors.textMuted : theme.colors.warning}
            />
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              {planName(summary)}
            </Text>
          </View>
          {(planStatusCopy(summary) ?? entitlementCopy(summary)) ? (
            <Text style={[typography.callout, { color: theme.colors.warning }]}>
              {planStatusCopy(summary) ?? entitlementCopy(summary)}
            </Text>
          ) : null}
          {summary.plan === "free" ? (
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              The free plan includes 500 AI actions a month, shared across every AI feature, plus
              one committed import. Budget unlocks every paid feature, and Pro adds bigger
              allowances.
            </Text>
          ) : null}
          {periodEndsCopy(summary) ? (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {periodEndsCopy(summary)}
            </Text>
          ) : null}
          {pendingCheckoutCopy(summary) ? (
            <Text style={[typography.caption, { color: theme.colors.warning }]}>
              {pendingCheckoutCopy(summary)}
            </Text>
          ) : null}
        </View>
      </Card>

      <Card accessibilityLabel="Plan usage">
        <View className="gap-3">
          <Text style={[typography.headline, { color: theme.colors.text }]}>This month</Text>
          {summary.usages.map((usage) => (
            <View key={usage.feature} className="gap-1">
              <View className="flex-row justify-between gap-2">
                <Text style={[typography.body, { color: theme.colors.text }]}>
                  {usageTitle(usage)}
                </Text>
                <Text style={[typography.body, { color: theme.colors.textMuted }]}>
                  {usage.used} of {usage.limit}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: theme.colors.brand,
                      width: ((usage.limit > 0
                        ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
                        : 0) + "%") as `${number}%`,
                    },
                  ]}
                />
              </View>
              {usageResetsCopy(usage) ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {usageResetsCopy(usage)}
                </Text>
              ) : null}
            </View>
          ))}
          {summary.allowances.map((allowance) => (
            <Text
              key={allowance.resource}
              style={[typography.body, { color: theme.colors.textMuted }]}
            >
              {allowance.resource === "custom_category"
                ? allowance.limit === null
                  ? allowance.used + " active custom categories (unlimited)"
                  : allowance.used + " of " + allowance.limit + " custom categories used"
                : ""}
            </Text>
          ))}
        </View>
      </Card>

      {summary.canCheckout || summary.canChangePlan ? (
        <Card accessibilityLabel={summary.canChangePlan ? "Change plan" : "Choose a plan"}>
          <View className="gap-3">
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              {summary.canChangePlan ? "Change plan" : "Choose a plan"}
            </Text>
            <PlanPicker
              plans={personalBillingPlans}
              suggestedPlan={summary.plan === "zoption_budget" ? "pro" : "budget"}
              current={
                summary.canChangePlan && summary.subscriptionPlan && summary.interval
                  ? { plan: summary.subscriptionPlan, interval: summary.interval }
                  : null
              }
              busy={busy}
              onCheckout={(choice, provider) => void checkout(choice, provider)}
              onChange={(choice) => void change(choice)}
            />
          </View>
        </Card>
      ) : null}

      {summary.canManageBilling && summary.status === "active" && !summary.cancelAtPeriodEnd ? (
        <Card accessibilityLabel="Manage subscription">
          <View className="gap-3">
            <Text style={[typography.headline, { color: theme.colors.text }]}>Subscription</Text>
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              Turn off automatic renewal. Your plan remains through the end of the current period,
              and no automatic refund is issued.
            </Text>
            <Button
              variant="secondary"
              loading={busy === "cancel"}
              onPress={() => setConfirmingCancel(true)}
            >
              Cancel renewal
            </Button>
          </View>
        </Card>
      ) : null}

      {summary.pendingCheckout !== null ? (
        <Card accessibilityLabel="Payment status">
          <View className="gap-3">
            <Text style={[typography.headline, { color: theme.colors.text }]}>Payment status</Text>
            <Button
              variant="secondary"
              loading={busy === "reconcile"}
              onPress={() => void checkPayment()}
            >
              Check payment status
            </Button>
          </View>
        </Card>
      ) : null}

      {message ? (
        <Text
          accessibilityRole="alert"
          style={[
            typography.body,
            {
              color: message.startsWith("Your subscription")
                ? theme.colors.brand
                : theme.colors.textMuted,
            },
          ]}
        >
          {message}
        </Text>
      ) : null}

      <ConfirmationDialog
        visible={confirmingCancel}
        title="Cancel renewal?"
        message="Renewal will stop. No automatic refund is issued, and your plan remains available through the end of the current period."
        confirmLabel="Cancel renewal"
        destructive
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={() => void runCancel()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radii.round, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radii.round },
});
