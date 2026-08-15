import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { monthlySubscriptionCost } from "@zoption/shared";

import { useLocalWorkspace, useSubscriptions } from "@/db/local-workspace-state";
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
import { spacing, typography } from "@/ui/tokens";
import { billingCycleLabels } from "./subscription-form";

export function SubscriptionsScreen() {
  const local = useLocalWorkspace();
  const state = useSubscriptions();

  const addSubscription = (): void => {
    router.push("/(app)/subscription");
  };

  return (
    <Screen
      action={
        <Button disabled={!local.workspace} onPress={addSubscription} variant="primary">
          Add subscription
        </Button>
      }
      description="Track recurring charges and their next billing dates offline."
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
          <Skeleton height={88} />
          <Skeleton height={88} />
        </View>
      ) : state.subscriptions.length === 0 ? (
        <EmptyState
          title="No subscriptions yet"
          description="Add streaming, software, or membership charges to see their monthly cost."
        />
      ) : (
        <View style={styles.stack}>
          <MonthlyCostCard subscriptions={state.subscriptions} />
          {state.subscriptions.map((subscription) => (
            <SubscriptionRow
              key={subscription.id}
              onPress={() =>
                router.push({ pathname: "/(app)/subscription", params: { id: subscription.id } })
              }
              subscription={subscription}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function MonthlyCostCard({ subscriptions }: { subscriptions: LocalSubscriptionItem[] }) {
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
  return (
    <Card accessibilityLabel="Monthly subscription cost">
      <View style={styles.rowBetween}>
        <View style={styles.costItem}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Monthly cost of active subscriptions
          </Text>
          <MoneyValue amountMinor={monthlyTotal} />
        </View>
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.brand}
          name="calendar-heart"
          size={28}
        />
      </View>
    </Card>
  );
}

function SubscriptionRow({
  subscription,
  onPress,
}: {
  subscription: LocalSubscriptionItem;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const conflicted = subscription.syncState === "conflicted";
  const failed = subscription.syncState === "failed";
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card
        accessibilityLabel={subscription.name + ", " + subscription.amountMinor + " minor"}
        style={{
          borderColor: conflicted ? theme.colors.warning : failed ? theme.colors.danger : undefined,
        }}
      >
        <View style={styles.stack}>
          <View style={styles.rowBetween}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              {subscription.name}
            </Text>
            <View style={styles.rowGap}>
              {subscription.syncState === "conflicted" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.warning}
                  name="alert-outline"
                  size={18}
                />
              ) : subscription.syncState === "failed" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.danger}
                  name="cloud-alert-outline"
                  size={18}
                />
              ) : subscription.syncState === "pending" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.warning}
                  name="cloud-upload-outline"
                  size={18}
                />
              ) : null}
            </View>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              {billingCycleLabels[subscription.billingCycle]} · next{" "}
              {subscription.nextBillingDate}
            </Text>
            {subscription.status === "canceled" ? (
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Canceled</Text>
            ) : (
              <MoneyValue amountMinor={subscription.amountMinor} />
            )}
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
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowGap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  costItem: { flex: 1, gap: spacing.xxs },
});
