import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import type { BillingInterval, BillingSummary } from "@zoption/shared";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ApiTransportError,
  cancelBillingSubscription,
  getBillingSummary,
  reconcileBillingCheckout,
  startBillingCheckout,
} from "@/api/billing";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button, Card, ConfirmationDialog, ErrorState, SelectionField, SkeletonLines } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, typography } from "@/ui/tokens";

import { entitlementCopy, pendingCheckoutCopy, periodEndsCopy, PLAN_PRICES, planName, planStatusCopy, usageResetsCopy, usageTitle } from "./billing-copy";

const RECONCILE_ATTEMPTS = 8;
const RECONCILE_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function BillingScreen() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [interval, setIntervalChoice] = useState<BillingInterval>("month");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const withToken = useCallback(
    async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await operation(await session.getAccessToken(false));
      } catch (error) {
        if (error instanceof ApiTransportError && error.code === "session_expired") {
          return operation(await session.getAccessToken(true));
        }
        throw error;
      }
    },
    [session],
  );

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const next = await withToken((token) => getBillingSummary({ accessToken: token }));
      setSummary(next);
      setPhase("ready");
    } catch (error) {
      setMessage(
        error instanceof ApiTransportError ? error.message : "Billing could not be loaded.",
      );
      setPhase("error");
    }
  }, [withToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const runCheckout = useCallback(async () => {
    setBusy("checkout");
    setMessage(null);
    try {
      const { approvalUrl } = await withToken((token) =>
        startBillingCheckout({ accessToken: token }, interval),
      );
      await WebBrowser.openBrowserAsync(approvalUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
      await reconcileLoop();
    } catch (error) {
      setMessage(
        error instanceof ApiTransportError ? error.message : "Checkout could not start.",
      );
    } finally {
      setBusy(null);
    }
  }, [interval, withToken]);

  const reconcileLoop = useCallback(async (): Promise<void> => {
    for (let attempt = 0; attempt < RECONCILE_ATTEMPTS; attempt += 1) {
      try {
        const result = await withToken((token) => reconcileBillingCheckout({ accessToken: token }));
        setSummary(result.summary);
        if (result.outcome === "confirmed") {
          setMessage("Your subscription is active. Welcome to Zoption Pro.");
          return;
        }
        if (result.outcome === "closed" || result.outcome === "none") {
          setMessage("Payment was not confirmed yet. Try again or check back shortly.");
          return;
        }
        if (result.outcome === "review_required") {
          setMessage("Zoption is reviewing your payment. Pro access is pending.");
          return;
        }
      } catch (error) {
        setMessage(
          error instanceof ApiTransportError ? error.message : "Payment status is unknown.",
        );
        return;
      }
      await sleep(RECONCILE_DELAY_MS);
    }
    setMessage("Payment confirmation is still in progress. Check back shortly.");
  }, [withToken]);

  const runCancel = useCallback(async () => {
    setConfirmingCancel(false);
    setBusy("cancel");
    setMessage(null);
    try {
      await withToken((token) => cancelBillingSubscription({ accessToken: token }));
      const next = await withToken((token) => getBillingSummary({ accessToken: token }));
      setSummary(next);
      setMessage("Renewal is off. Pro access stays until the end of the current period.");
    } catch (error) {
      setMessage(
        error instanceof ApiTransportError ? error.message : "The subscription could not be changed.",
      );
    } finally {
      setBusy(null);
    }
  }, [withToken]);

  if (phase === "loading") {
    return (
      <Screen title="Plan and billing">
        <SkeletonLines lines={4} />
      </Screen>
    );
  }

  if (phase === "error" || summary === null) {
    return (
      <Screen title="Plan and billing">
        <ErrorState
          title="Plan unavailable"
          message={message ?? "Billing could not be loaded."}
          onRetry={() => void load()}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Plan and billing" description="Limits are enforced by the Zoption server">
      <Card accessibilityLabel="Current plan">
        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons
              name={summary.plan === "zoption_pro" ? "crown-outline" : "wallet-outline"}
              size={20}
              color={summary.plan === "zoption_pro" ? theme.colors.warning : theme.colors.textMuted}
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
              The free plan includes a small monthly allowance of AI questions and imports.
              Upgrade for more.
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
                      width:
                        ((usage.limit > 0
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
            <Text key={allowance.resource} style={[typography.body, { color: theme.colors.textMuted }]}>
              {allowance.resource === "custom_category"
                ? allowance.limit === null
                  ? allowance.used + " active custom categories (unlimited)"
                  : allowance.used + " of " + allowance.limit + " custom categories used"
                : ""}
            </Text>
          ))}
        </View>
      </Card>

      {summary.canCheckout ? (
        <Card accessibilityLabel="Upgrade">
          <View className="gap-3">
            <Text style={[typography.headline, { color: theme.colors.text }]}>Upgrade to Pro</Text>
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              100 AI questions per 14-day cycle, 10 imports per month and unlimited custom
              categories.
            </Text>
            <SelectionField
              label="Billing interval"
              value={interval}
              options={PLAN_PRICES.map((plan) => ({
                id: plan.interval,
                label: plan.label,
                detail: plan.priceLabel,
              }))}
              placeholder="Monthly"
              sheetTitle="Billing interval"
              onSelect={(value) => setIntervalChoice(value as BillingInterval)}
            />
            <Button loading={busy === "checkout"} onPress={() => void runCheckout()}>
              Continue with PayPal
            </Button>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Checkout opens in your browser. Payment confirmation is verified by the Zoption
              server before Pro access is granted.
            </Text>
          </View>
        </Card>
      ) : null}

      {summary.canManageBilling && summary.status === "active" && !summary.cancelAtPeriodEnd ? (
        <Card accessibilityLabel="Manage subscription">
          <View className="gap-3">
            <Text style={[typography.headline, { color: theme.colors.text }]}>Subscription</Text>
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              Turn off automatic renewal. Pro access remains through the end of the current
              period, and no automatic refund is issued.
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
              onPress={() => void reconcileLoop()}
            >
              Check payment status
            </Button>
          </View>
        </Card>
      ) : null}

      {message ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: message.startsWith("Your subscription") ? theme.colors.brand : theme.colors.textMuted }]}>
          {message}
        </Text>
      ) : null}

      <ConfirmationDialog
        visible={confirmingCancel}
        title="Cancel renewal?"
        message="Renewal will stop. No automatic refund is issued, and Pro access remains available through the end of the current period."
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
