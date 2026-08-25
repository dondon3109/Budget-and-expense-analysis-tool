import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { monthlySubscriptionCost, resolveCategoryEmoji } from "@zoption/shared";

import {
  useLocalReferenceData,
  useLocalWorkspace,
  useSubscriptions,
} from "@/db/local-workspace-state";
import type { LocalSubscriptionItem } from "@/db/repository";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  MoneyValue,
  Skeleton,
} from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

type SubscriptionFilter = "all" | "active" | "canceled";

export function SubscriptionsScreen() {
  const local = useLocalWorkspace();
  const state = useSubscriptions();
  const reference = useLocalReferenceData();
  const [filter, setFilter] = useState<SubscriptionFilter>("all");
  const theme = useZoptionTheme();

  const addSubscription = (): void => {
    router.push("/(app)/subscription");
  };

  const categoriesMap = useMemo(() => {
    const map = new Map<string, { name: string; color?: string; emoji?: string }>();
    for (const cat of reference.data?.categories ?? []) {
      map.set(cat.id, {
        name: cat.name,
        color: cat.color,
        emoji: resolveCategoryEmoji(cat) ?? undefined,
      });
    }
    return map;
  }, [reference.data?.categories]);

  const accountsMap = useMemo(() => {
    const map = new Map<string, { name: string; currency: string }>();
    for (const acc of reference.data?.accounts ?? []) {
      map.set(acc.id, {
        name: acc.name,
        currency: acc.currency,
      });
    }
    return map;
  }, [reference.data?.accounts]);

  const activeSubscriptions = useMemo(
    () => state.subscriptions.filter((s) => s.status === "active"),
    [state.subscriptions],
  );

  const canceledSubscriptions = useMemo(
    () => state.subscriptions.filter((s) => s.status === "canceled"),
    [state.subscriptions],
  );

  const filteredSubscriptions = useMemo(() => {
    if (filter === "active") return activeSubscriptions;
    if (filter === "canceled") return canceledSubscriptions;
    return state.subscriptions;
  }, [filter, state.subscriptions, activeSubscriptions, canceledSubscriptions]);

  return (
    <Screen
      action={
        <Button disabled={!local.workspace} onPress={addSubscription} variant="primary">
          + Add
        </Button>
      }
      title="Subscriptions"
    >
      {state.error ? (
        <ErrorState
          message={state.error}
          onRetry={state.retry}
          title="Subscriptions unavailable"
        />
      ) : state.loading ? (
        <View accessibilityLabel="Loading subscriptions" style={styles.stack}>
          <Skeleton height={100} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </View>
      ) : state.subscriptions.length === 0 ? (
        <EmptyState
          icon="calendar-sync-outline"
          title="No subscriptions yet"
          description="Add streaming, software, or membership charges to see their monthly cost."
          action={
            <Button disabled={!local.workspace} onPress={addSubscription} variant="primary">
              + Add a subscription
            </Button>
          }
        />
      ) : (
        <View style={styles.stack}>
          <MonthlyCostCard
            activeCount={activeSubscriptions.length}
            canceledCount={canceledSubscriptions.length}
            subscriptions={state.subscriptions}
          />

          <View
            accessibilityLabel="Filter subscriptions by status"
            accessibilityRole="tablist"
            style={styles.filterRow}
          >
            {(["all", "active", "canceled"] as const).map((key) => {
              const selected = filter === key;
              const count =
                key === "all"
                  ? state.subscriptions.length
                  : key === "active"
                    ? activeSubscriptions.length
                    : canceledSubscriptions.length;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(key)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selected ? theme.colors.brand : theme.colors.surface,
                      borderColor: selected ? theme.colors.brand : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.label,
                      { color: selected ? theme.colors.onBrand : theme.colors.text },
                    ]}
                  >
                    {key === "all" ? "All" : key === "active" ? "Active" : "Canceled"}
                  </Text>
                  <View
                    style={[
                      styles.filterBadge,
                      {
                        backgroundColor: selected
                          ? "rgba(255, 255, 255, 0.25)"
                          : theme.colors.surfaceRaised,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: selected ? theme.colors.onBrand : theme.colors.textMuted,
                          fontSize: 11,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {filteredSubscriptions.length === 0 ? (
            <Card style={styles.emptyFilteredCard}>
              <MaterialCommunityIcons
                color={theme.colors.textMuted}
                name="filter-variant-remove"
                size={28}
              />
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                No {filter} subscriptions
              </Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted, textAlign: "center" }]}>
                {filter === "canceled"
                  ? "All your subscriptions are currently active."
                  : "You do not have any active subscriptions."}
              </Text>
            </Card>
          ) : (
            filteredSubscriptions.map((subscription) => (
              <SubscriptionRow
                key={subscription.id}
                account={accountsMap.get(subscription.accountId ?? "")}
                category={categoriesMap.get(subscription.categoryId ?? "")}
                onPress={() =>
                  router.push({ pathname: "/(app)/subscription", params: { id: subscription.id } })
                }
                subscription={subscription}
              />
            ))
          )}
        </View>
      )}

      {/* Floating Action Button for easy one-handed subscription creation */}
      {state.subscriptions.length > 0 ? (
        <View style={styles.fabPosition}>
          <Pressable
            accessibilityLabel="Add subscription"
            accessibilityRole="button"
            android_ripple={{ color: "rgba(255, 255, 255, 0.22)", borderless: false, radius: 28 }}
            onPress={addSubscription}
            style={[styles.fabButton, { backgroundColor: theme.colors.brand }]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.onBrand}
              name="plus"
              size={28}
            />
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

function MonthlyCostCard({
  subscriptions,
  activeCount,
  canceledCount,
}: {
  subscriptions: LocalSubscriptionItem[];
  activeCount: number;
  canceledCount: number;
}) {
  const theme = useZoptionTheme();
  const monthlyTotal = useMemo(
    () =>
      subscriptions
        .filter((subscription) => subscription.status === "active")
        .reduce(
          (total, subscription) =>
            total + monthlySubscriptionCost(subscription.amountMinor, subscription.billingCycle),
          0,
        ),
    [subscriptions],
  );

  const yearlyCount = useMemo(
    () => subscriptions.filter((s) => s.status === "active" && s.billingCycle === "yearly").length,
    [subscriptions],
  );

  return (
    <Card accessibilityLabel="Monthly subscription cost" style={styles.summaryCard}>
      <View style={styles.rowBetween}>
        <View style={styles.costItem}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Total monthly cost
          </Text>
          <MoneyValue amountMinor={monthlyTotal} style={typography.display} />
          <Text style={[typography.caption, { color: theme.colors.textMuted, fontSize: 11 }]}>
            Active plans only · Yearly plans divided across 12 months
          </Text>
        </View>
        <View
          accessibilityElementsHidden
          style={[styles.summaryIconBox, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons
            color={theme.colors.brand}
            name="calendar-sync"
            size={24}
          />
        </View>
      </View>

      <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />

      <View style={styles.summaryStatsRow}>
        <View style={styles.statPill}>
          <View style={[styles.statusDot, { backgroundColor: theme.colors.income }]} />
          <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
            {activeCount} active
          </Text>
        </View>
        {canceledCount > 0 ? (
          <View style={styles.statPill}>
            <View style={[styles.statusDot, { backgroundColor: theme.colors.textMuted }]} />
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {canceledCount} canceled
            </Text>
          </View>
        ) : null}
        {yearlyCount > 0 ? (
          <View style={styles.statPill}>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {yearlyCount} billed yearly
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function SubscriptionRow({
  subscription,
  category,
  account,
  onPress,
}: {
  subscription: LocalSubscriptionItem;
  category?: { name: string; color?: string; emoji?: string };
  account?: { name: string; currency: string };
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const conflicted = subscription.syncState === "conflicted";
  const failed = subscription.syncState === "failed";
  const isCanceled = subscription.status === "canceled";
  const isYearly = subscription.billingCycle === "yearly";
  const monthlyEquivalent = isYearly ? Math.round(subscription.amountMinor / 12) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${subscription.name}, ${subscription.amountMinor} minor, ${subscription.status}`}
      android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
      onPress={onPress}
    >
      <Card
        style={[
          styles.card,
          {
            borderColor: conflicted
              ? theme.colors.warning
              : failed
                ? theme.colors.danger
                : theme.colors.border,
            opacity: isCanceled ? 0.75 : 1,
          },
        ]}
      >
        <View style={styles.stack}>
          {/* Header row with category & status */}
          <View style={styles.rowBetween}>
            <View style={styles.categoryBadge}>
              {category?.emoji ? (
                <Text style={styles.categoryEmoji}>{category.emoji}</Text>
              ) : (
                <View
                  style={[
                    styles.categoryDot,
                    { backgroundColor: category?.color ?? theme.colors.brand },
                  ]}
                />
              )}
              <Text
                numberOfLines={1}
                style={[
                  typography.caption,
                  { color: theme.colors.text, fontWeight: "600", flexShrink: 1 },
                ]}
              >
                {category?.name ?? "Subscription"}
              </Text>
            </View>

            <View style={styles.rowGap}>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: isCanceled
                      ? theme.colors.canvasMuted
                      : theme.colors.brandSoft,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: isCanceled ? theme.colors.textMuted : theme.colors.income,
                      fontSize: 11,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {isCanceled ? "Canceled" : "Active"}
                </Text>
              </View>

              {subscription.syncState === "conflicted" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.warning}
                  name="alert-outline"
                  size={16}
                />
              ) : subscription.syncState === "failed" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.danger}
                  name="cloud-alert-outline"
                  size={16}
                />
              ) : subscription.syncState === "pending" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.warning}
                  name="cloud-upload-outline"
                  size={16}
                />
              ) : null}
            </View>
          </View>

          {/* Name and Price */}
          <View style={styles.rowBetween}>
            <Text
              numberOfLines={1}
              style={[
                typography.headline,
                {
                  color: isCanceled ? theme.colors.textMuted : theme.colors.text,
                  flex: 1,
                  marginRight: spacing.sm,
                },
              ]}
            >
              {subscription.name}
            </Text>
            <View style={styles.amountWrap}>
              <MoneyValue
                amountMinor={subscription.amountMinor}
                currency={subscription.currency === "USD" ? "USD" : "PHP"}
                style={[
                  typography.headline,
                  {
                    color: isCanceled ? theme.colors.textMuted : theme.colors.text,
                    fontWeight: "700",
                  },
                ]}
              />
              <Text style={[typography.caption, { color: theme.colors.textMuted, fontSize: 11 }]}>
                /{subscription.billingCycle === "yearly" ? "yr" : "mo"}
              </Text>
            </View>
          </View>

          {/* Details row: Next billing date & Account */}
          <View style={styles.rowBetween}>
            <View style={styles.detailItem}>
              <MaterialCommunityIcons
                color={theme.colors.textMuted}
                name="calendar-clock-outline"
                size={14}
              />
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                Next: {subscription.nextBillingDate}
              </Text>
            </View>

            {account ? (
              <View style={styles.detailItem}>
                <MaterialCommunityIcons
                  color={theme.colors.textMuted}
                  name="wallet-outline"
                  size={14}
                />
                <Text
                  numberOfLines={1}
                  style={[typography.caption, { color: theme.colors.textMuted, maxWidth: 120 }]}
                >
                  {account.name}
                </Text>
              </View>
            ) : null}

            {monthlyEquivalent !== null && !isCanceled ? (
              <Text style={[typography.caption, { color: theme.colors.textMuted, fontSize: 11 }]}>
                ≈ <MoneyValue amountMinor={monthlyEquivalent} />/mo
              </Text>
            ) : null}
          </View>

          {conflicted || failed ? (
            <Text
              style={[
                typography.caption,
                { color: conflicted ? theme.colors.warning : theme.colors.danger },
              ]}
            >
              {conflicted ? "Conflict preserved" : "Sync needs repair"}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  card: { padding: spacing.md },
  summaryCard: { padding: spacing.md, gap: spacing.sm },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowGap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  costItem: { flex: 1, gap: 2 },
  summaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    marginVertical: spacing.xxs,
  },
  summaryStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radii.round,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  filterBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.round,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    flexShrink: 1,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: radii.round,
  },
  categoryEmoji: {
    fontSize: 13,
    lineHeight: 16,
  },
  statusPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
  },
  amountWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  emptyFilteredCard: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  fabPosition: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    ...elevation.card,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
