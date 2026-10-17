import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { accountTypeIcon } from "@/features/setup/account-types";
import { MoneyValue, moneyAccessibilityLabel } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { otherCurrenciesWithAmounts, type DashboardSummary } from "@zoption/shared";

import { homeCardStyles } from "./HomeCardParts";
import { withTapSound } from "@/features/sounds/sound-effects";

export function BalanceCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const balances = summary.accountBalances;
  const workspaceCurrency = useWorkspaceCurrency();
  const otherBalances = balances?.balancesByCurrency ?? {};
  const otherCurrencies = otherCurrenciesWithAmounts(otherBalances, workspaceCurrency);
  // Same order as the web dashboard: Cash first, then by name.
  const accounts = (balances?.items ?? [])
    .filter((account) => !account.archived)
    .sort((left, right) => {
      if (left.name === "Cash") return -1;
      if (right.name === "Cash") return 1;
      return left.name.localeCompare(right.name);
    });

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Total balance. Opens account management."
        onPress={withTapSound(() => router.push("/(app)/money-setup"))}
      >
        <View accessibilityLabel="Total balance" style={styles.plain}>
          <View style={styles.cardHeaderRow}>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              Total Balance
            </Text>
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
        </View>
      </Pressable>
      {accounts.length > 0 ? (
        <View accessibilityLabel="Account balances" style={{ gap: spacing.xs }}>
          {accounts.map((account) => (
            <View
              key={account.id}
              accessible
              accessibilityLabel={`${account.name}, ${moneyAccessibilityLabel(account.balanceMinor, account.currency)}`}
              style={styles.accountRow}
            >
              <View style={[styles.accountIcon, { backgroundColor: theme.colors.canvasMuted }]}>
                <MaterialCommunityIcons
                  color={theme.colors.textMuted}
                  name={accountTypeIcon(account.type)}
                  size={18}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[typography.body, { color: theme.colors.text, flex: 1 }]}
              >
                {account.name}
              </Text>
              <MoneyValue
                amountMinor={account.balanceMinor}
                currency={account.currency}
                tone={account.balanceMinor < 0 ? "expense" : "default"}
                style={styles.accountMoney}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ...homeCardStyles,
  plain: { gap: spacing.xs },
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
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  accountIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  accountMoney: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  metaMoney: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
});
