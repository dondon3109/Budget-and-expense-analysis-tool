import { router } from "expo-router";
import { View } from "react-native";

import { TransactionRow } from "@/ui/components";
import { spacing } from "@/ui/tokens";
import type { TransactionRecord } from "@zoption/shared";

import { RowDivider, SectionHeader } from "./HomeCardParts";

// `recent` is the dashboard's separate newest-first read, already limited to
// the rows this section renders.
export function RecentActivitySection({ recent }: { recent: TransactionRecord[] }) {
  if (recent.length === 0) return null;

  return (
    <View accessibilityLabel="Recent transactions" style={{ gap: spacing.xs }}>
      <SectionHeader
        title="Recent activity"
        actionLabel="View all transactions"
        onAction={() => router.push("/(app)/(tabs)/transactions")}
      />
      <View>
        {recent.map((tx, index) => (
          <View key={tx.id}>
            {index > 0 ? <RowDivider /> : null}
            <TransactionRow
              transaction={{ ...tx, accountId: null, notes: null }}
              onPress={() => router.push({ pathname: "/(app)/transaction", params: { id: tx.id } })}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
