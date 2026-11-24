import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { dismissQuickStart } from "@/api/onboarding";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { withTapSound } from "@/features/sounds/sound-effects";
import { openAddTransaction } from "@/features/transactions/AddTransactionPicker";

const QUICK_START_GUIDE_DISMISSED_KEY = "zoption_quick_start_guide_dismissed";

export function quickStartDismissStorageKey(subject: string | null): string {
  return `${QUICK_START_GUIDE_DISMISSED_KEY}.${subject ?? "default"}`;
}

export function QuickStartGuideCard({ firstAccountId }: { firstAccountId?: string }) {
  const theme = useZoptionTheme();
  const { subject, status: sessionStatus, getAccessToken } = useSessionSnapshot();
  const [collapsed, setCollapsed] = useState(false);
  // Start unresolved so returning users who already dismissed the guide do not see it flash.
  const [status, setStatus] = useState<"loading" | "visible" | "dismissed">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    void Promise.all([
      SecureStore.getItemAsync(quickStartDismissStorageKey(subject)).catch(() => null),
      SecureStore.getItemAsync(QUICK_START_GUIDE_DISMISSED_KEY).catch(() => null),
    ])
      .then(([scoped, legacy]) => {
        if (!active) return;
        setStatus(scoped === "true" || legacy === "true" ? "dismissed" : "visible");
      })
      .catch(() => {
        if (active) setStatus("visible");
      });
    return () => {
      active = false;
    };
  }, [subject]);

  const handleDismiss = () => {
    setStatus("dismissed");
    useOnboardingStore.getState().setQuickStartDismissed(true);
    void SecureStore.setItemAsync(quickStartDismissStorageKey(subject), "true").catch(
      () => undefined,
    );
    if (sessionStatus === "signed-in" && subject && !isDummyDevelopmentSubject(subject)) {
      void getAccessToken(false)
        .then((accessToken) => dismissQuickStart({ accessToken }))
        .catch(() => undefined);
    }
  };

  if (status !== "visible") {
    return null;
  }

  return (
    <Card accessibilityLabel="Quick start tutorial guide">
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <View style={[styles.badge, { backgroundColor: theme.colors.brandSoft }]}>
            <Text
              style={[
                typography.caption,
                { color: theme.colors.brand, fontWeight: "700", fontSize: 10 },
              ]}
            >
              GETTING STARTED
            </Text>
          </View>
          <Text style={[typography.headline, { color: theme.colors.text }]}>Quick start guide</Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            4 steps to master your personal ledger
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={collapsed ? "Expand guide" : "Collapse guide"}
            hitSlop={8}
            onPress={withTapSound(() => setCollapsed((prev) => !prev))}
            style={styles.iconBtn}
          >
            <MaterialCommunityIcons
              name={collapsed ? "chevron-down" : "chevron-up"}
              size={20}
              color={theme.colors.textMuted}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss guide"
            hitSlop={8}
            onPress={withTapSound(handleDismiss)}
            style={styles.iconBtn}
          >
            <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {!collapsed && (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          {/* Step 1 */}
          <View
            style={[
              styles.stepCard,
              { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}>
                <Text
                  style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}
                >
                  1
                </Text>
              </View>
              <Text style={[typography.headline, { color: theme.colors.text, flex: 1 }]}>
                Adjust starting balances
              </Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Set your Cash, Bank, and e-wallet balances so your numbers match what you have in real
              life.
            </Text>
            <View style={styles.stepActionRow}>
              <Button
                variant="secondary"
                size="compact"
                onPress={() =>
                  router.push(
                    firstAccountId
                      ? `/(app)/reference?entityType=account&id=${firstAccountId}`
                      : "/(app)/money-setup",
                  )
                }
              >
                Adjust balance
              </Button>
            </View>
          </View>

          {/* Step 2 */}
          <View
            style={[
              styles.stepCard,
              { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}>
                <Text
                  style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}
                >
                  2
                </Text>
              </View>
              <Text style={[typography.headline, { color: theme.colors.text, flex: 1 }]}>
                Set envelope budgets
              </Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Create monthly spending limits for groceries, bills, dining out, and more.
            </Text>
            <View style={styles.stepActionRow}>
              <Button
                variant="secondary"
                size="compact"
                onPress={() => router.push("/(app)/(tabs)/budgets")}
              >
                Open Budgets
              </Button>
            </View>
          </View>

          {/* Step 3 */}
          <View
            style={[
              styles.stepCard,
              { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}>
                <Text
                  style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}
                >
                  3
                </Text>
              </View>
              <Text style={[typography.headline, { color: theme.colors.text, flex: 1 }]}>
                Log daily spending
              </Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Record expenses using manual input, camera receipt scanning, or AI voice dictation.
            </Text>
            <View style={styles.stepActionRow}>
              <Button variant="secondary" size="compact" onPress={openAddTransaction}>
                Log transaction
              </Button>
            </View>
          </View>

          {/* Step 4 */}
          <View
            style={[
              styles.stepCard,
              { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}>
                <Text
                  style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}
                >
                  4
                </Text>
              </View>
              <Text style={[typography.headline, { color: theme.colors.text, flex: 1 }]}>
                Tutorials & guides
              </Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Learn zero-based budgeting principles, SMS notification parsing, and debt payoff
              methods.
            </Text>
            <View style={styles.stepActionRow}>
              <Button
                variant="primary"
                size="compact"
                onPress={() => router.push("/(app)/tutorials")}
              >
                View tutorials
              </Button>
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    alignSelf: "flex-start",
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
  },
  stepCard: {
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stepNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  stepActionRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginTop: spacing.xxs,
  },
});
