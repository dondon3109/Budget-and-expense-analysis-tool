import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { isSubscriptionUsageTracked, subscriptionRoi, type SubscriptionRoi } from "@zoption/shared";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { usePlan } from "@/auth/plan-state";
import { useSessionSnapshot } from "@/auth/session-state";
import { useLocalWorkspace, useSubscriptionUsage } from "@/db/local-workspace-state";
import type { SubscriptionUsageAction } from "@/db/transaction-mutation-repository";
import type { LocalSubscriptionItem } from "@/db/view-models";
import { useAccountGate } from "@/features/account-prompt/use-account-gate";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { localIsoDate } from "@/features/dashboard/dashboard-view";
import { Button, Card, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { uploadSubscriptionUsage } from "./subscription-usage-upload";

function statusLabel(roi: SubscriptionRoi): string {
  if (roi.status === "untracked") return "No check-ins yet";
  if (roi.status === "idle") return `Unused for ${roi.daysSinceLastUse} days`;
  if (roi.daysSinceLastUse === 0) return "Used today";
  if (roi.daysSinceLastUse === 1) return "Used yesterday";
  return `Used ${roi.daysSinceLastUse} days ago`;
}

/**
 * Subscription ROI (Pro): a "Used it" check-in per bill per day, what each use cost this cycle,
 * and a nudge to cancel once a tracked bill sits unused for 30 days. Only bills with "Track usage"
 * on get rows; rent and utilities start off. Taps save to this phone at once and upload with the
 * next personal sync, so they work offline; online they also upload right away, so the Worker's idle
 * nudge sees them. Personal only: in a family the card stays hidden. Other plans and guests see what it does and where to
 * get it. `highlightId` is the bill a push nudge opened the screen on.
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
  const { family } = useActiveWorkspace();
  const { workspace } = useLocalWorkspace();
  const { usage, error: readError } = useSubscriptionUsage();
  const { openFeature } = useAccountGate();
  const [error, setError] = useState<string | null>(null);
  // Offline after a cold start the plan is unknown; the Worker only ever filled this phone's
  // copy for a Pro account, so a copy with history keeps the card working until the plan loads.
  const hasHistory = usage.usage.length > 0 || usage.tracking.length > 0;
  const isPro =
    sessionStatus === "signed-in" && (plan === "zoption_pro" || (plan === null && hasHistory));
  const today = localIsoDate(new Date());
  const active = subscriptions.filter((item) => item.status === "active");

  if (family || active.length === 0) return null;

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
              See what each use costs with Pro.
            </Text>
          </View>
        </View>
        <Button variant="secondary" onPress={() => openFeature("billing", "/(app)/plan-billing")}>
          See Pro
        </Button>
      </Card>
    );
  }

  const tap = (id: string, action: SubscriptionUsageAction) => {
    if (!workspace) return;
    const usedOn = action === "check_in" || action === "undo" ? today : null;
    workspace.transactionMutations.queueSubscriptionUsage(id, action, usedOn).then(
      () => {
        setError(null);
        // Offline this fails quietly and the tap waits in the queue for the next sync.
        void getAccessToken(false)
          .then((accessToken) => uploadSubscriptionUsage(workspace, accessToken))
          .catch(() => undefined);
      },
      () => setError("Could not save that on this phone. Try again."),
    );
  };

  const usedOnById = new Map(usage.usage.map((row) => [row.subscriptionId, row.usedOn]));
  const trackedById = new Map(usage.tracking.map((row) => [row.subscriptionId, row.tracked]));
  const tracked = active.filter((item) =>
    isSubscriptionUsageTracked(item.name, trackedById.get(item.id)),
  );
  const untracked = active.filter((item) => !tracked.includes(item));
  const shownError = error ?? readError;

  return (
    <Card accessibilityLabel="Usage and value" style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons color={theme.colors.brand} name="gauge" size={22} />
        <Text style={[typography.headline, styles.flex, { color: theme.colors.text }]}>
          Usage and value
        </Text>
      </View>
      {shownError ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {shownError}
        </Text>
      ) : null}
      {tracked.map((item) => {
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
                  icon="check"
                  onPress={() => tap(item.id, "undo")}
                  variant="secondary"
                >
                  Undo
                </Button>
              ) : (
                <Button
                  accessibilityLabel={`I used ${item.name} today`}
                  onPress={() => tap(item.id, "check_in")}
                  variant="primary"
                >
                  Used it
                </Button>
              )}
            </View>
            <View style={styles.stats}>
              {roi.usesThisCycle > 0 ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {roi.usesThisCycle} use{roi.usesThisCycle === 1 ? "" : "s"} this cycle
                </Text>
              ) : null}
              {roi.costPerUseMinor === null ? null : (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  <MoneyValue
                    amountMinor={roi.costPerUseMinor}
                    currency={item.currency}
                    style={[typography.caption, { color: theme.colors.textMuted }]}
                  />{" "}
                  per use
                </Text>
              )}
              {roi.weekStreak > 0 ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {roi.weekStreak}-week streak
                </Text>
              ) : null}
            </View>
            <View style={styles.rowActions}>
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
              <Button
                accessibilityLabel={`Stop tracking ${item.name}`}
                onPress={() => tap(item.id, "untrack")}
                variant="quiet"
              >
                Stop tracking
              </Button>
            </View>
          </View>
        );
      })}
      {untracked.length > 0 ? (
        <View style={styles.untracked}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Not tracked</Text>
          <View style={styles.untrackedList}>
            {untracked.map((item) => (
              <Button
                key={item.id}
                accessibilityLabel={`Track ${item.name}`}
                icon="plus"
                onPress={() => tap(item.id, "track")}
                variant="secondary"
              >
                {item.name}
              </Button>
            ))}
          </View>
        </View>
      ) : null}
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
  rowActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  untracked: { gap: spacing.xs },
  untrackedList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
});
