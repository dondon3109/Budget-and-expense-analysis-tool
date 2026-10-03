import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { Card, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
import { otherCurrenciesWithAmounts, type DashboardSummary } from "@zoption/shared";

import { homeCardStyles, SectionLabel } from "./HomeCardParts";

export function BalanceCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const balances = summary.accountBalances;
  const workspaceCurrency = useWorkspaceCurrency();
  const otherBalances = balances?.balancesByCurrency ?? {};
  const otherCurrencies = otherCurrenciesWithAmounts(otherBalances, workspaceCurrency);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Total balance. Opens account management."
      onPress={() => router.push("/(app)/money-setup")}
    >
      <Card accessibilityLabel="Total balance">
        <View style={styles.cardHeaderRow}>
          <SectionLabel>Total Balance</SectionLabel>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.textMuted}
            name="chevron-right"
            size={20}
          />
        </View>
        <View style={{ gap: spacing.xs }}>
          <MoneyValue amountMinor={balances?.overallBalanceMinor ?? 0} style={styles.heroMoney} />
          {otherCurrencies.map((currency) => {
            const otherMinor = otherBalances[currency] ?? 0;
            return (
              <View key={currency} style={styles.usdMeta}>
                {otherMinor > 0 ? (
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>+</Text>
                ) : null}
                <MoneyValue
                  amountMinor={otherMinor}
                  currency={currency}
                  tone={otherMinor < 0 ? "expense" : "default"}
                  style={styles.metaMoney}
                />
              </View>
            );
          })}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ...homeCardStyles,
  heroMoney: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  usdMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  metaMoney: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
});
