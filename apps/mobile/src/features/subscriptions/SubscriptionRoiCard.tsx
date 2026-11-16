import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  SUBSCRIPTION_IDLE_DAYS,
  subscriptionRoi,
  type SubscriptionRoi,
  type SubscriptionUsage,
  type SubscriptionUsageList,
} from "@zoption/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  checkInSubscription,
  getSubscriptionUsage,
  undoSubscriptionCheckIn,
} from "@/api/subscription-usage";
import { usePlan } from "@/auth/plan-state";
import { useSessionSnapshot } from "@/auth/session-state";
import type { LocalSubscriptionItem } from "@/db/view-models";
import { useAccountGate } from "@/features/account-prompt/use-account-gate";
import { localIsoDate } from "@/features/dashboard/dashboard-view";
import { Button, Card, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

function statusLabel(roi: SubscriptionRoi): string {
  if (roi.status === "untracked") return "Not tracked yet";
  if (roi.status === "idle") return `Unused for ${roi.daysSinceLastUse} days`;
  if (roi.daysSinceLastUse === 0) return "Used today";
  if (roi.daysSinceLastUse === 1) return "Used yesterday";
  return `Used ${roi.daysSinceLastUse} days ago`;
}

/** Swaps one subscription's check-in days into the list. */
function replaceUsage(
  current: SubscriptionUsageList | null,
  next: SubscriptionUsage,
): SubscriptionUsageList {
  const others = (current?.usage ?? []).filter((row) => row.subscriptionId !== next.subscriptionId);
  return { usage: next.usedOn.length > 0 ? [...others, next] : others };
}

/**
 * Subscription ROI (Pro): a "Used it" check-in per bill per day, what each use cost this cycle,
 * and a nudge to cancel once a tracked bill sits unused for 30 days. Check-ins are Worker state
 * and need a connection; other plans and guests see what it does and where to get it.
 * `highlightId` is the bill a push nudge opened the screen on.
 */
export function SubscriptionRoiCard({
  subscriptions,
  highlightId,
}: {
  subscriptions: LocalSubscriptionItem[];
  highlightId?: string | null;
}) {
  const theme = useZoptionTheme();
  const { plan } = usePlan();
  const { status: sessionStatus, getAccessToken } = useSessionSnapshot();
  const { openFeature } = useAccountGate();
  const isPro = plan === "zoption_pro" && sessionStatus === "signed-in";
  const [usage, setUsage] = useState<SubscriptionUsageList | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = localIsoDate(new Date());
  const active = subscriptions.filter((item) => item.status === "active");

  const load = useCallback(async () => {
    try {
      const accessToken = await getAccessToken(false);
      setUsage(await getSubscriptionUsage({ accessToken }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load check-ins.");
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isPro) void load();
  }, [isPro, load]);

  if (active.length === 0) return null;

  if (!isPro) {
    return (
      <Card accessibilityLabel="Usage and value" style={styles.card}>
        <View style={styles.header}>
          <MaterialCommunityIcons color={theme.colors.brand} name="gauge" size={22} />
          <View style={styles.flex}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Are your bills worth it?
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              With Zoption Pro, tap “Used it” whenever you use a service to see what each use costs,
              and get a reminder before an unused one renews.
            </Text>
          </View>
        </View>
        <Button variant="secondary" onPress={() => openFeature("billing", "/(app)/plan-billing")}>
          See Pro
        </Button>
      </Card>
    );
  }

  const toggle = async (id: string, undo: boolean) => {
    if (savingId) return;
    setSavingId(id);
    try {
      const accessToken = await getAccessToken(false);
      const next = undo
        ? await undoSubscriptionCheckIn({ accessToken }, id, today)
        : await checkInSubscription({ accessToken }, id, today);
      setUsage((current) => replaceUsage(current, next));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that check-in.");
    } finally {
      setSavingId(null);
    }
  };

  const usedOnById = new Map(usage?.usage.map((row) => [row.subscriptionId, row.usedOn]));

  return (
    <Card accessibilityLabel="Usage and value" style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons color={theme.colors.brand} name="gauge" size={22} />
        <View style={styles.flex}>
          <Text style={[typography.headline, { color: theme.colors.text }]}>Usage and value</Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Tap “Used it” when you use a service. Unused for {SUBSCRIPTION_IDLE_DAYS} days, it gets
            flagged before it renews.
          </Text>
        </View>
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
      {active.map((item) => {
        const roi = subscriptionRoi(item, usedOnById.get(item.id) ?? [], today);
        const idle = roi.status === "idle";
        return (
          <View
            key={item.id}
            accessibilityLabel={`${item.name}, ${statusLabel(roi)}`}
            style={[
              styles.row,
              {
                backgroundColor: idle ? theme.colors.warningSoft : theme.colors.surfaceRaised,
                borderColor:
                  highlightId === item.id
                    ? theme.colors.brand
                    : idle
                      ? theme.colors.warning
                      : theme.colors.border,
              },
            ]}
          >
            <View style={styles.rowTop}>
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
                  {item.name}
                </Text>
                <Text
                  style={[
                    typography.caption,
                    {
                      color: idle
                        ? theme.colors.warning
                        : roi.status === "active"
                          ? theme.colors.income
                          : theme.colors.textMuted,
                      fontWeight: idle ? "700" : "400",
                    },
                  ]}
                >
                  {statusLabel(roi)}
                </Text>
              </View>
              {roi.usedToday ? (
                <Button
                  accessibilityLabel={`Undo today's check-in for ${item.name}`}
                  disabled={savingId === item.id}
                  icon="check"
                  onPress={() => void toggle(item.id, true)}
                  variant="secondary"
                >
                  Undo
                </Button>
              ) : (
                <Button
                  accessibilityLabel={`I used ${item.name} today`}
                  disabled={savingId === item.id}
                  onPress={() => void toggle(item.id, false)}
                  variant="primary"
                >
                  Used it
                </Button>
              )}
            </View>
            <View style={styles.stats}>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {roi.usesThisCycle} use{roi.usesThisCycle === 1 ? "" : "s"} this cycle
              </Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {roi.costPerUseMinor === null ? (
                  "No cost per use yet"
                ) : (
                  <>
                    <MoneyValue amountMinor={roi.costPerUseMinor} currency={item.currency} /> per
                    use
                  </>
                )}
              </Text>
              {roi.weekStreak > 0 ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {roi.weekStreak}-week streak
                </Text>
              ) : null}
            </View>
            {idle ? (
              <Button
                icon="close-circle-outline"
                onPress={() =>
                  router.push({ pathname: "/(app)/subscription", params: { id: item.id } })
                }
                variant="secondary"
              >
                Cancel it
              </Button>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
  row: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stats: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, rowGap: 2 },
});
