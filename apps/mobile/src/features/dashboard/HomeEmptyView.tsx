import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useGoalCta } from "@/features/primary-goal/goal-personalization";
import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export function HomeEmptyView({ syncing }: { syncing: boolean }) {
  const theme = useZoptionTheme();
  const goalCta = useGoalCta();

  if (syncing) {
    return (
      <View style={styles.emptyContainer}>
        <View
          accessibilityElementsHidden
          style={[
            styles.emptyIconBox,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <MaterialCommunityIcons name="cloud-sync-outline" size={34} color={theme.colors.brand} />
        </View>
        <Text
          accessibilityRole="header"
          style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
        >
          Checking your workspace…
        </Text>
        <Text style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}>
          Synchronizing your encrypted financial workspace records.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <View
        accessibilityElementsHidden
        style={[
          styles.emptyIconBox,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons name="wallet-plus-outline" size={36} color={theme.colors.brand} />
      </View>
      <Text
        accessibilityRole="header"
        style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
      >
        Welcome to your workspace
      </Text>
      <Text style={[typography.headline, { color: theme.colors.text, textAlign: "center" }]}>
        Build your real financial picture
      </Text>
      <Text style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}>
        Your workspace starts clean without fictional transactions. Choose how you want to begin:
        migrate existing bank or Excel statements in under a minute, or build clean as you go.
      </Text>

      <View style={{ width: "100%", gap: spacing.sm, marginTop: spacing.xs }}>
        {goalCta ? (
          <Button accessibilityHint="Suggested for your goal" onPress={goalCta.open}>
            {goalCta.label}
          </Button>
        ) : null}
        <Card accessibilityLabel="Option A: Bring your data">
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <MaterialCommunityIcons
                name="file-excel-outline"
                size={20}
                color={theme.colors.brand}
              />
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Option A: Bring your data
              </Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Upload Excel sheets or bank CSVs with automated column matching and duplicate checks.
            </Text>
            <View style={{ marginTop: spacing.xs }}>
              <Button
                accessibilityHint="Opens the guided 3-step bank file import"
                onPress={() =>
                  router.push({ pathname: "/(app)/import", params: { firstRun: "1" } })
                }
              >
                Bring your data (File import)
              </Button>
            </View>
          </View>
        </Card>

        <Card accessibilityLabel="Option B: Start fresh">
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.brand} />
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Option B: Start fresh
              </Text>
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Configure your accounts and track spending with voice or manual entries.
            </Text>
            <View style={{ marginTop: spacing.xs }}>
              <Button
                variant="secondary"
                accessibilityHint="Opens manual transaction entry"
                onPress={() => router.push("/(app)/transaction")}
              >
                Start fresh (Add transaction)
              </Button>
            </View>
          </View>
        </Card>
      </View>

      <View style={styles.onboardingSteps}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Step 1: Set up accounts and categories"
          onPress={() => router.push("/(app)/money-setup")}
          style={[
            styles.stepCard,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <View
            accessibilityElementsHidden
            style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}>
              1
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Set up accounts &amp; categories
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Create cash, bank, or e-wallet accounts and customize tags.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Step 2: Add your first transaction"
          onPress={() => router.push("/(app)/transaction")}
          style={[
            styles.stepCard,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <View
            accessibilityElementsHidden
            style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}>
              2
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Add transaction or scan receipt
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Log daily spending or snap a receipt to auto-draft expenses.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Step 3: Set category budgets"
          onPress={() => router.push("/(app)/(tabs)/budgets")}
          style={[
            styles.stepCard,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <View
            accessibilityElementsHidden
            style={[styles.stepNumberBadge, { backgroundColor: theme.colors.brandSoft }]}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}>
              3
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Set monthly budget limits
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Keep food, utilities, and shopping expenses in check.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
  },
  emptyDescription: {
    textAlign: "center",
    maxWidth: 340,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  onboardingSteps: {
    width: "100%",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});
