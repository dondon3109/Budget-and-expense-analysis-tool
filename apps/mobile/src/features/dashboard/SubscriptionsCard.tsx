import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { LocalSubscriptionItem } from "@/db/view-models";
import { Card, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { homeCardStyles, SectionLabel } from "./HomeCardParts";

const VISIBLE_ROWS = 4;

// Active subscriptions, soonest renewal first. The full list, with canceled
// and paused ones, lives on the Subscriptions screen behind "View all".
export function SubscriptionsCard({ subscriptions }: { subscriptions: LocalSubscriptionItem[] }) {
  const theme = useZoptionTheme();
  const upcoming = subscriptions
    .filter((subscription) => subscription.status === "active")
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));

  if (upcoming.length === 0) return null;

  return (
    <Card accessibilityLabel="Subscriptions">
      <View style={homeCardStyles.cardHeaderRow}>
        <SectionLabel>Subscriptions</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all subscriptions"
          onPress={() => router.push("/(app)/subscriptions")}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            View all
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing.sm }}>
        {upcoming.slice(0, VISIBLE_ROWS).map((subscription) => (
          <Pressable
            key={subscription.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/(app)/subscription", params: { id: subscription.id } })
            }
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
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
        ))}
      </View>
    </Card>
  );
}
