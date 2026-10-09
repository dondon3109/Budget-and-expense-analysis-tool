import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { resolveCategoryEmoji, type Currency } from "@zoption/shared";
import type { LocalBudgetOccasion } from "@/db/view-models";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { CategoryBadge, moneyAccessibilityLabel, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { occasionDateLabel } from "./budget-form";
import type { BudgetMonthRow } from "./budget-month-view";
import { withTapSound } from "@/features/sounds/sound-effects";

const SMALL_MONEY = { fontSize: 12, lineHeight: 16, fontWeight: "600" as const };

/** How much of a limit has been used, for the bar color: calm, close to the limit, or over it. */
function useUsageColor(usedPercent: number, fallback: string): string {
  const theme = useZoptionTheme();
  if (usedPercent > 100) return String(theme.colors.danger);
  if (usedPercent >= 85) return String(theme.colors.warning);
  return fallback;
}

function ProgressLine({
  usedPercent,
  color,
  height = 3,
}: {
  usedPercent: number;
  color: string;
  height?: number;
}) {
  const theme = useZoptionTheme();
  const fill = useUsageColor(usedPercent, color);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, { height, backgroundColor: theme.colors.border }]}
    >
      <View
        style={{
          height,
          borderRadius: radii.round,
          width: `${Math.min(100, Math.max(0, usedPercent))}%` as DimensionValue,
          backgroundColor: fill,
        }}
      />
    </View>
  );
}

/** The plan's headline: what is left, one bar, and what was spent. Flat on the screen. */
export function PlanHero({
  label,
  limitMinor,
  spentMinor,
  remainingMinor,
  usedPercent,
}: {
  label: string;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  usedPercent: number;
}) {
  const theme = useZoptionTheme();
  const over = remainingMinor < 0;
  return (
    <View accessible accessibilityLabel={`${label} summary`} style={styles.hero}>
      <Text style={[typography.caption, styles.heroLabel, { color: theme.colors.textMuted }]}>
        {over ? "OVER PLAN BY" : label.toUpperCase()}
      </Text>
      <MoneyValue
        amountMinor={Math.abs(remainingMinor)}
        maxFontSizeMultiplier={1.2}
        style={styles.heroAmount}
        tone={over ? "expense" : "default"}
      />
      <ProgressLine color={String(theme.colors.brand)} height={6} usedPercent={usedPercent} />
      <View style={styles.heroMeta}>
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          <MoneyValue amountMinor={spentMinor} style={SMALL_MONEY} /> spent of{" "}
          <MoneyValue amountMinor={limitMinor} style={SMALL_MONEY} />
        </Text>
        <Text
          style={[typography.label, { color: over ? theme.colors.danger : theme.colors.textMuted }]}
        >
          {usedPercent}%
        </Text>
      </View>
    </View>
  );
}

/** The every-month plan has no spending: it is the standard a month starts from. */
export function DefaultsHero({ limitMinor }: { limitMinor: number }) {
  const theme = useZoptionTheme();
  return (
    <View accessible style={styles.hero}>
      <Text style={[typography.caption, styles.heroLabel, { color: theme.colors.textMuted }]}>
        PLANNED EVERY MONTH
      </Text>
      <MoneyValue amountMinor={limitMinor} maxFontSizeMultiplier={1.2} style={styles.heroAmount} />
      <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
        Every month starts from these limits. A month can set its own for any category.
      </Text>
    </View>
  );
}

export function SectionHeader({ title, trailing }: { title: string; trailing?: string }) {
  const theme = useZoptionTheme();
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: theme.colors.border }]}>
      <Text accessibilityRole="header" style={[typography.label, { color: theme.colors.text }]}>
        {title}
      </Text>
      {trailing ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{trailing}</Text>
      ) : null}
    </View>
  );
}

/**
 * One category limit: a divider-separated row with a thin bar, not a card. `showSpend` is false
 * on the every-month plan, which has nothing spent against it.
 */
export function BudgetRow({
  row,
  showSpend,
  tagDefaults,
  onPress,
}: {
  row: BudgetMonthRow;
  showSpend: boolean;
  /** Mark rows that come from the every-month default, on the month plan. */
  tagDefaults: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const currency: Currency = useWorkspaceCurrency();
  const emoji =
    row.categoryIconEmoji ?? resolveCategoryEmoji({ name: row.categoryName, kind: "expense" });
  const blocked = row.syncState === "conflicted" || row.syncState === "failed";
  const spokenAmount = showSpend
    ? `spent ${moneyAccessibilityLabel(row.spentMinor, currency)} of ${moneyAccessibilityLabel(row.limitMinor, currency)}, ${
        row.remainingMinor >= 0
          ? `${moneyAccessibilityLabel(row.remainingMinor, currency)} remaining`
          : `${moneyAccessibilityLabel(Math.abs(row.remainingMinor), currency)} over budget`
      }`
    : `limit ${moneyAccessibilityLabel(row.limitMinor, currency)}`;

  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <Pressable
        accessibilityHint={
          row.syncState === "conflicted" ? "Review this budget conflict" : "Edit this budget"
        }
        accessibilityLabel={`${row.categoryName} budget: ${spokenAmount}`}
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
        disabled={blocked}
        onPress={withTapSound(onPress)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View style={styles.rowTop}>
          <CategoryBadge color={row.categoryColor} emoji={emoji ?? null} size={40} />
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
              {row.categoryName}
            </Text>
            <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
              {showSpend ? (
                <>
                  <MoneyValue amountMinor={row.spentMinor} style={SMALL_MONEY} /> of{" "}
                  <MoneyValue amountMinor={row.limitMinor} style={SMALL_MONEY} />
                </>
              ) : (
                "Limit per month"
              )}
              {tagDefaults && row.source === "every-month" ? "  ·  Every month" : ""}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <MoneyValue
              amountMinor={showSpend ? row.remainingMinor : row.limitMinor}
              maxFontSizeMultiplier={1.2}
              style={styles.rowAmount}
              tone={showSpend && row.overBudget ? "expense" : "default"}
            />
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {showSpend ? (row.overBudget ? "over" : "left") : "each month"}
            </Text>
          </View>
        </View>
        {showSpend ? (
          <View style={styles.rowBar}>
            <ProgressLine color={row.categoryColor} usedPercent={row.usedPercent} />
          </View>
        ) : null}
      </Pressable>

      {row.syncState === "conflicted" ? (
        <Pressable
          accessibilityLabel={`Review conflict for ${row.categoryName}`}
          accessibilityRole="button"
          onPress={withTapSound(() =>
            router.push({ pathname: "/(app)/budget-conflict", params: { id: row.id } }),
          )}
          style={styles.statusLine}
        >
          <MaterialCommunityIcons
            color={theme.colors.warning}
            name="alert-circle-outline"
            size={14}
          />
          <Text style={[typography.caption, { color: theme.colors.warning }]}>
            Conflict preserved. Review
          </Text>
        </Pressable>
      ) : row.syncState === "failed" ? (
        <View style={styles.statusLine}>
          <MaterialCommunityIcons
            color={theme.colors.danger}
            name="cloud-alert-outline"
            size={14}
          />
          <Text style={[typography.caption, { color: theme.colors.danger }]}>
            Sync needs repair
          </Text>
        </View>
      ) : row.syncState === "pending" ? (
        <View style={styles.statusLine}>
          <MaterialCommunityIcons
            color={theme.colors.textMuted}
            name="cloud-upload-outline"
            size={14}
          />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Pending sync</Text>
        </View>
      ) : null}
    </View>
  );
}

/** An occasion in the list: its day, what its budget covers, and how much is left. */
export function OccasionRow({
  occasion,
  onPress,
}: {
  occasion: LocalBudgetOccasion;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const remaining = occasion.totalLimitMinor - occasion.totalSpentMinor;
  const usedPercent =
    occasion.totalLimitMinor === 0
      ? 0
      : Math.round((occasion.totalSpentMinor / occasion.totalLimitMinor) * 1000) / 10;
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <Pressable
        accessibilityHint="Open this occasion's budget"
        accessibilityLabel={`${occasion.title}, ${occasionDateLabel(occasion.date)}`}
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
        onPress={withTapSound(onPress)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View style={styles.rowTop}>
          <View style={[styles.dateTile, { backgroundColor: theme.colors.brandSoft }]}>
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.brand}
              name="party-popper"
              size={20}
            />
          </View>
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
              {occasion.title}
            </Text>
            <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
              {occasionDateLabel(occasion.date)}
              {"  ·  "}
              <MoneyValue amountMinor={occasion.totalSpentMinor} style={SMALL_MONEY} /> of{" "}
              <MoneyValue amountMinor={occasion.totalLimitMinor} style={SMALL_MONEY} />
            </Text>
          </View>
          <View style={styles.rowRight}>
            <MoneyValue
              amountMinor={remaining}
              maxFontSizeMultiplier={1.2}
              style={styles.rowAmount}
              tone={remaining < 0 ? "expense" : "default"}
            />
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {remaining < 0 ? "over" : "left"}
            </Text>
          </View>
        </View>
        <View style={styles.rowBar}>
          <ProgressLine color={String(theme.colors.brand)} usedPercent={usedPercent} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs, paddingVertical: spacing.sm },
  heroLabel: { letterSpacing: 0.8 },
  heroAmount: { fontSize: 36, lineHeight: 42, letterSpacing: -1 },
  heroMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  track: { width: "100%", borderRadius: radii.round, overflow: "hidden" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  rowRight: { alignItems: "flex-end", gap: 2 },
  rowAmount: { fontSize: 16, lineHeight: 20 },
  rowBar: { marginTop: spacing.sm },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  dateTile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
