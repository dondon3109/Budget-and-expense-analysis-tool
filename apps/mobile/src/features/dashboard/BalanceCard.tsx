import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useDefaultSpendingAccountStore } from "@/stores/default-spending-account-store";
import { Card, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import {
  preferredTransactionAccount,
  type AccountBalanceSummaryItem,
  type AccountType,
  type DashboardSummary,
} from "@zoption/shared";

import { balanceAllocation } from "./balance-allocation";
import { homeCardStyles, SectionLabel } from "./HomeCardParts";

const ACCOUNT_TYPE_ICONS: Record<AccountType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  cash: "cash",
  checking: "bank-outline",
  savings: "piggy-bank-outline",
  credit: "credit-card-outline",
  other: "wallet-outline",
};

function accountSubtitle(
  account: AccountBalanceSummaryItem,
  sharePercent: number | undefined,
): string {
  if (account.archived) return "Archived";
  if (account.currency === "USD") return "Held in USD";
  if (account.balanceMinor < 0) return "Owed";
  if (sharePercent === undefined) return "No balance";
  return `${sharePercent}% of assets`;
}

export function BalanceCard({ summary }: { summary: DashboardSummary }) {
  const theme = useZoptionTheme();
  const balances = summary.accountBalances;
  const items = balances?.items ?? [];
  const netMinor = summary.metrics.netMinor;
  const isNetPositive = netMinor >= 0;
  const usdMinor = balances?.balancesByCurrency.USD ?? 0;
  const defaultSpendingAccountId = useDefaultSpendingAccountStore((state) => state.accountId);
  const setDefaultSpendingAccountId = useDefaultSpendingAccountStore((state) => state.setAccountId);
  const defaultSpendingAccount = preferredTransactionAccount(
    items.filter((account) => !account.archived),
    defaultSpendingAccountId,
  );
  const allocation = balanceAllocation(items);
  // Series colors come from theme tokens so the bar reads in every theme. The
  // expense tone is left out so no account reads as negative; any account past
  // the fifth shares the muted tone.
  const palette = [
    theme.colors.brand,
    theme.colors.info,
    theme.colors.budget,
    theme.colors.warning,
    theme.colors.text,
  ];
  const slices = allocation.slices.map((slice, index) => ({
    ...slice,
    color: palette[index] ?? theme.colors.textMuted,
  }));
  const sliceById = new Map(slices.map((slice) => [slice.id, slice]));

  return (
    <Card accessibilityLabel="Account balances">
      <View style={styles.cardHeaderRow}>
        <SectionLabel>Total Balance</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage accounts"
          onPress={() => router.push("/(app)/money-setup")}
          hitSlop={8}
        >
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            Manage
          </Text>
        </Pressable>
      </View>
      <View style={{ gap: spacing.xs }}>
        <MoneyValue amountMinor={balances?.overallBalanceMinor ?? 0} style={styles.heroMoney} />
        <View style={styles.heroMetaRow}>
          <View
            style={[
              styles.netChangePill,
              { backgroundColor: isNetPositive ? theme.colors.brandSoft : theme.colors.dangerSoft },
            ]}
          >
            <MaterialCommunityIcons
              name={isNetPositive ? "trending-up" : "trending-down"}
              size={14}
              color={isNetPositive ? theme.colors.income : theme.colors.expense}
            />
            <MoneyValue
              amountMinor={netMinor}
              tone={isNetPositive ? "income" : "expense"}
              style={styles.netPillMoney}
            />
            <Text
              style={[
                typography.caption,
                { color: isNetPositive ? theme.colors.income : theme.colors.expense },
              ]}
            >
              this month
            </Text>
          </View>
          {usdMinor !== 0 ? (
            <View style={styles.usdMeta}>
              {usdMinor > 0 ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>+</Text>
              ) : null}
              <MoneyValue
                amountMinor={usdMinor}
                currency="USD"
                tone={usdMinor < 0 ? "expense" : "default"}
                style={styles.metaMoney}
              />
            </View>
          ) : null}
        </View>
      </View>

      {slices.length > 0 ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Balance split: ${slices
            .map((slice) => `${slice.name} ${slice.sharePercent} percent`)
            .join(", ")}`}
          style={[styles.allocationBar, { backgroundColor: theme.colors.canvasMuted }]}
        >
          {slices.map((slice) => (
            <View
              key={slice.id}
              style={{ flex: slice.balanceMinor, backgroundColor: slice.color }}
            />
          ))}
        </View>
      ) : null}

      {allocation.liabilitiesMinor < 0 ? (
        <View style={styles.cardHeaderRow}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Total owed</Text>
          <MoneyValue
            amountMinor={allocation.liabilitiesMinor}
            tone="expense"
            style={styles.metaMoney}
          />
        </View>
      ) : null}

      {items.length > 0 ? (
        <View style={[styles.accountList, { borderTopColor: theme.colors.border }]}>
          {items.map((account) => {
            const isDefaultSpending = account.id === defaultSpendingAccount?.id;
            const slice = sliceById.get(account.id);
            const accent = slice?.color ?? theme.colors.textMuted;
            return (
              <View key={account.id} style={styles.accountRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${account.name}, balance ${account.balanceMinor / 100} ${account.currency}. Tap to adjust balance or edit.`}
                  accessibilityHint="Opens account editor to adjust balance"
                  android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
                  // Android's NativeWind interop drops layout from a callback style,
                  // so the row's size lives in className and its layout in the static
                  // inner View; the callback only dims the row while pressed.
                  className="flex-1"
                  onPress={() =>
                    router.push(`/(app)/reference?entityType=account&id=${account.id}`)
                  }
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <View style={styles.accountRowMain}>
                    <View
                      accessibilityElementsHidden
                      style={[styles.accountIconBox, { backgroundColor: theme.colors.canvasMuted }]}
                    >
                      <MaterialCommunityIcons
                        name={ACCOUNT_TYPE_ICONS[account.type]}
                        size={18}
                        color={accent}
                      />
                    </View>
                    <View style={styles.accountText}>
                      <Text
                        numberOfLines={1}
                        style={[typography.label, { color: theme.colors.text }]}
                      >
                        {account.name}
                      </Text>
                      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                        {accountSubtitle(account, slice?.sharePercent)}
                      </Text>
                    </View>
                    <MoneyValue
                      amountMinor={account.balanceMinor}
                      currency={account.currency}
                      tone={account.balanceMinor < 0 ? "expense" : "default"}
                      style={styles.accountMoney}
                    />
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${account.name} as the default spending account`}
                  accessibilityState={{ selected: isDefaultSpending }}
                  disabled={account.archived}
                  hitSlop={4}
                  onPress={() => setDefaultSpendingAccountId(account.id)}
                  style={styles.accountDefaultButton}
                >
                  <MaterialCommunityIcons
                    color={isDefaultSpending ? theme.colors.brand : theme.colors.textMuted}
                    name={isDefaultSpending ? "star" : "star-outline"}
                    size={20}
                  />
                </Pressable>
              </View>
            );
          })}
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Tap an account to adjust its balance. The starred account is where new transactions
            start.
          </Text>
        </View>
      ) : null}
    </Card>
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
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
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
  accountList: {
    gap: spacing.xxs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accountText: {
    flex: 1,
    minWidth: 0,
  },
  accountMoney: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  netChangePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
  },
  netPillMoney: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  accountRowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget,
  },
  accountDefaultButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  accountIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
