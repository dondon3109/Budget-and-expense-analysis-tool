import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { isDevelopmentAppVariant } from "@/config/app-variant";
import { BrandMark } from "@/ui/brand-mark";
import { Button, Card, MoneyValue, SyncStatus } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

interface FeaturePillar {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
}

const FEATURE_PILLARS: FeaturePillar[] = [
  {
    icon: "lightning-bolt-outline",
    title: "Offline-first speed",
    description:
      "Record transactions and transfers on the spot in milliseconds. Data lives encrypted on your device and syncs when connected.",
  },
  {
    icon: "camera-outline",
    title: "Smart receipt scanning",
    description:
      "Snap a photo of paper or digital receipts to draft itemized expense records without manual typing.",
  },
  {
    icon: "chart-donut",
    title: "Category budgets & trends",
    description:
      "Set monthly spending limits, watch remaining balances in real time, and monitor 7-day and monthly cash flow curves.",
  },
  {
    icon: "shield-check-outline",
    title: "Private by design",
    description:
      "No bank logins or account passwords required. Encrypted local SQLite keeps your money records private to you.",
  },
];

const PREVIEW_CATEGORIES = [
  { name: "Groceries", emoji: "🛒", share: 38, amountMinor: 980000, color: "#08776d" },
  { name: "Utilities", emoji: "⚡", share: 24, amountMinor: 620000, color: "#2f65c8" },
  { name: "Dining", emoji: "🍽️", share: 18, amountMinor: 465000, color: "#a0441f" },
  { name: "Transport", emoji: "🚗", share: 12, amountMinor: 310000, color: "#6e4fc5" },
];

export default function WelcomeScreen() {
  const theme = useZoptionTheme();
  const demoEnabled = isDevelopmentAppVariant();
  const { signInWithDummyAccount, signInWithPassword } = useSessionSnapshot();
  const [dummyBusy, setDummyBusy] = useState(false);

  async function handleDummySignIn(): Promise<void> {
    if (dummyBusy) return;
    setDummyBusy(true);
    try {
      if (signInWithDummyAccount) {
        await signInWithDummyAccount();
      } else {
        await signInWithPassword("dummy@zoption.local", "dummy-password");
      }
      router.replace("/(app)/(tabs)");
    } catch {
      // Fall back to standard sign-in screen on failure
      router.push("/(public)/sign-in");
    } finally {
      setDummyBusy(false);
    }
  }

  return (
    <Screen
      title="Your money, in your hands."
      description="Philippine-peso-first budgeting with encrypted local-first records."
    >
      {/* Brand header & capability tags */}
      <View style={styles.headerSection}>
        <BrandMark />
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.pillBadge,
              { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.border },
            ]}
          >
            <MaterialCommunityIcons name="flash-outline" size={13} color={theme.colors.brand} />
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
              Offline First
            </Text>
          </View>
          <View
            style={[
              styles.pillBadge,
              { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
            ]}
          >
            <MaterialCommunityIcons name="lock-outline" size={13} color={theme.colors.textMuted} />
            <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
              Encrypted SQLite
            </Text>
          </View>
          <View
            style={[
              styles.pillBadge,
              { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
              🇵🇭 PHP Native
            </Text>
          </View>
        </View>
      </View>

      {/* Interactive illustrative workspace preview */}
      <Card accessibilityLabel="Illustrative private workspace preview">
        <View style={styles.previewHeader}>
          <View style={styles.previewTitleGroup}>
            <Text style={[typography.caption, { color: theme.colors.textMuted, fontWeight: "700" }]}>
              ILLUSTRATIVE WORKSPACE
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              August 2026 Overview
            </Text>
          </View>
          <SyncStatus state="synced" />
        </View>

        {/* Balance & monthly delta */}
        <View style={styles.previewBalanceBlock}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Total Net Balance
          </Text>
          <View style={styles.balanceRow}>
            <MoneyValue amountMinor={4285000} style={styles.heroMoney} />
            <View
              style={[
                styles.deltaPill,
                { backgroundColor: theme.colors.brandSoft },
              ]}
            >
              <MaterialCommunityIcons name="trending-up" size={14} color={theme.colors.income} />
              <Text
                style={[
                  typography.caption,
                  { color: theme.colors.income, fontWeight: "700" },
                ]}
              >
                +₱14,350
              </Text>
            </View>
          </View>
        </View>

        {/* Cash flow split row */}
        <View
          style={[
            styles.flowSplitRow,
            { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.flowSplitColumn}>
            <View style={styles.flowSplitLabel}>
              <MaterialCommunityIcons
                name="arrow-down-left"
                size={14}
                color={theme.colors.income}
              />
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Money In</Text>
            </View>
            <MoneyValue amountMinor={6850000} tone="income" style={typography.headline} />
          </View>
          <View style={[styles.flowDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.flowSplitColumn}>
            <View style={styles.flowSplitLabel}>
              <MaterialCommunityIcons
                name="arrow-up-right"
                size={14}
                color={theme.colors.expense}
              />
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Money Out</Text>
            </View>
            <MoneyValue amountMinor={-2565000} tone="expense" style={typography.headline} />
          </View>
        </View>

        {/* Category progress preview */}
        <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
          <Text style={[typography.caption, { color: theme.colors.textMuted, fontWeight: "600" }]}>
            TOP EXPENSE CATEGORIES
          </Text>
          {PREVIEW_CATEGORIES.map((cat) => (
            <View key={cat.name} style={styles.categoryPreviewRow}>
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text
                numberOfLines={1}
                style={[typography.caption, { color: theme.colors.text, flex: 1, fontWeight: "500" }]}
              >
                {cat.name}
              </Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted, marginRight: spacing.xs }]}>
                {cat.share}%
              </Text>
              <View style={[styles.catTrack, { backgroundColor: theme.colors.border }]}>
                <View
                  style={[
                    styles.catFill,
                    { width: `${cat.share * 2}%`, backgroundColor: cat.color },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Illustrative offline badge */}
        <View
          style={[
            styles.offlinePill,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <MaterialCommunityIcons name="check-circle" size={14} color={theme.colors.brand} />
          <Text style={[typography.caption, { color: theme.colors.text, flex: 1 }]}>
            GrabCar · ₱280.00 (Captured offline, synced)
          </Text>
        </View>

        <Text style={[typography.caption, styles.disclaimerText, { color: theme.colors.textMuted }]}>
          Preview values are synthetic and illustrative.
        </Text>
      </Card>

      {/* Feature Pillars */}
      <View style={styles.featuresContainer}>
        <Text
          accessibilityRole="header"
          style={[typography.headline, { color: theme.colors.text }]}
        >
          Built for native Android speed
        </Text>

        <View style={styles.featureGrid}>
          {FEATURE_PILLARS.map((pillar) => (
            <Card key={pillar.title} style={styles.featureCard}>
              <View
                accessibilityElementsHidden
                style={[
                  styles.featureIconWrap,
                  { backgroundColor: theme.colors.brandSoft },
                ]}
              >
                <MaterialCommunityIcons
                  name={pillar.icon}
                  size={22}
                  color={theme.colors.brand}
                />
              </View>
              <View style={{ gap: spacing.xxs, flex: 1 }}>
                <Text style={[typography.headline, { color: theme.colors.text }]}>
                  {pillar.title}
                </Text>
                <Text style={[typography.body, { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }]}>
                  {pillar.description}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      </View>

      {/* Call to action section */}
      <View style={styles.ctaSection}>
        <Button
          accessibilityHint="Opens sign-in screen"
          onPress={() => router.push("/(public)/sign-in")}
          size="large"
          variant="primary"
        >
          Sign in to Zoption
        </Button>

        {demoEnabled ? (
          <Button
            accessibilityHint="Quickly test with a local dummy account"
            disabled={dummyBusy}
            loading={dummyBusy}
            onPress={() => void handleDummySignIn()}
            variant="secondary"
          >
            Sign in with dummy account
          </Button>
        ) : null}

        <View style={styles.assuranceRow}>
          <MaterialCommunityIcons
            name="shield-outline"
            size={14}
            color={theme.colors.textMuted}
          />
          <Text
            style={[
              typography.caption,
              { color: theme.colors.textMuted, textAlign: "center", flexShrink: 1 },
            ]}
          >
            No bank credentials required · Your account works on both web and mobile
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerSection: {
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    alignItems: "center",
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  previewTitleGroup: {
    gap: 2,
    flex: 1,
  },
  previewBalanceBlock: {
    gap: 2,
    marginVertical: spacing.xxs,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heroMoney: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  deltaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
  },
  flowSplitRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  flowSplitColumn: {
    flex: 1,
    gap: 2,
  },
  flowSplitLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  flowDivider: {
    width: 1,
    height: "80%",
  },
  categoryPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  categoryEmoji: {
    fontSize: 14,
    width: 20,
    textAlign: "center",
  },
  catTrack: {
    width: 64,
    height: 6,
    borderRadius: radii.round,
    overflow: "hidden",
  },
  catFill: {
    height: 6,
    borderRadius: radii.round,
  },
  offlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.xxs,
  },
  disclaimerText: {
    marginTop: spacing.xxs,
  },
  featuresContainer: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  featureGrid: {
    gap: spacing.sm,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaSection: {
    width: "100%",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  assuranceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xxs,
  },
});
