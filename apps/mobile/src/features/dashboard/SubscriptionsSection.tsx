import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { LocalSubscriptionItem } from "@/db/view-models";
import { MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { RowDivider, SectionHeader } from "./HomeCardParts";
import { withTapSound } from "@/features/sounds/sound-effects";

const VISIBLE_ROWS = 4;

// Active subscriptions, soonest renewal first. The full list, with canceled
// and paused ones, lives on the Subscriptions screen behind "View all".
export function SubscriptionsSection({
  subscriptions,
}: {
  subscriptions: LocalSubscriptionItem[];
}) {
  const theme = useZoptionTheme();
  const upcoming = subscriptions
    .filter((subscription) => subscription.status === "active")
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));

  if (upcoming.length === 0) return null;

  return (
    <View accessibilityLabel="Subscriptions" style={{ gap: spacing.xs }}>
      <SectionHeader
        title="Subscriptions"
        actionLabel="View all subscriptions"
        onAction={() => router.push("/(app)/subscriptions")}
      />
      <View>
        {upcoming.slice(0, VISIBLE_ROWS).map((subscription, index) => (
          <View key={subscription.id}>
            {index > 0 ? <RowDivider /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={withTapSound(() =>
                router.push({ pathname: "/(app)/subscription", params: { id: subscription.id } }),
              )}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.xs,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { color: theme.colors.text }]} numberOfLines={1}>
                  {subscription.name}
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  Next: {subscription.nextBillingDate}
                </Text>
              </View>
              <MoneyValue
                amountMinor={subscription.amountMinor}
                currency={subscription.currency}
                style={[typography.body, { color: theme.colors.text, fontWeight: "600" }]}
              />
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                /{subscription.billingCycle === "yearly" ? "yr" : "mo"}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
