import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Card, TransactionRow } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
import type { TransactionRecord } from "@zoption/shared";

import { homeCardStyles, SectionLabel } from "./HomeCardParts";

// `recent` is the dashboard's separate newest-first read, already limited to
// the rows this card renders.
export function RecentActivityCard({ recent }: { recent: TransactionRecord[] }) {
  const theme = useZoptionTheme();

  if (recent.length === 0) return null;

  return (
    <Card accessibilityLabel="Recent transactions">
      <View style={homeCardStyles.cardHeaderRow}>
        <SectionLabel>Recent activity</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all transactions"
          onPress={() => router.push("/(app)/(tabs)/transactions")}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            View all
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing.xs }}>
        {recent.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={{
              ...tx,
              accountId: null,
              notes: null,
            }}
            onPress={() =>
              router.push({
                pathname: "/(app)/transaction",
                params: { id: tx.id },
              })
            }
          />
        ))}
      </View>
    </Card>
  );
}
