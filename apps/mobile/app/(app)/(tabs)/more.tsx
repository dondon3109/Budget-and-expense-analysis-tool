import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { usePlan } from "@/auth/plan-state";
import { useSessionSnapshot } from "@/auth/session-state";
import { seedDummyWorkspaceData } from "@/db/demo-seed";
import { useLocalWorkspace, useLocalWorkspaceStats } from "@/db/local-workspace-state";
import { OtaUpdateSettingsCard } from "@/features/ota-updates";
import { UpdateSettingsCard } from "@/features/updates";
import { Button, Card, ConfirmationDialog } from "@/ui/components";
import { ThemePicker } from "@/ui/theme-picker";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

interface MenuItemProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
}

function MenuItem({ icon, title, subtitle, badge, onPress }: MenuItemProps) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
      className="w-full flex-row items-center gap-3"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: pressed ? theme.colors.canvasMuted : "transparent" },
      ]}
    >
      <View accessibilityElementsHidden style={styles.menuIconColumn}>
        <MaterialCommunityIcons name={icon} size={24} color={theme.colors.brand} />
      </View>
      <View style={styles.menuTextWrap}>
        <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
          {subtitle}
        </Text>
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.brandSoft }]}>
          <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
            {badge}
          </Text>
        </View>
      ) : null}
      <MaterialCommunityIcons
        accessibilityElementsHidden
        name="chevron-right"
        size={20}
        color={theme.colors.textMuted}
      />
    </Pressable>
  );
}

export default function MoreScreen() {
  const session = useSessionSnapshot();
  const planState = usePlan();
  const local = useLocalWorkspace();
  const localStats = useLocalWorkspaceStats();
  const theme = useZoptionTheme();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const handleSeedData = async (): Promise<void> => {
    if (!local.workspace || seeding) return;
    setSeeding(true);
    try {
      await seedDummyWorkspaceData(local.workspace.database);
      setSeedSuccess(true);
      setTimeout(() => setSeedSuccess(false), 3000);
    } finally {
      setSeeding(false);
    }
  };

  const unsyncedCount =
    (localStats.stats?.unsyncedOperationCount ?? 0) +
    (localStats.stats?.unresolvedConflictCount ?? 0);

  const confirmSignOut = async (): Promise<void> => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await session.signOut({ discardUnsyncedChanges: unsyncedCount > 0 });
    } catch (error) {
      setConfirmingSignOut(false);
      setSignOutError(error instanceof Error ? error.message : "Zoption could not sign you out.");
    } finally {
      setSigningOut(false);
    }
  };

  const isPro = planState.plan === "zoption_pro";

  return (
    <Screen
      title="More"
      description="Settings, financial tools, and offline device controls."
    >
      <Card
        accessibilityLabel="AI Financial Assistant"
        style={[
          styles.assistantCard,
          { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.brand },
        ]}
      >
        <View className="flex-row items-center gap-3">
          <View style={[styles.assistantIcon, { backgroundColor: theme.colors.brand }]}>
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.onBrand}
              name="robot-happy-outline"
              size={22}
            />
          </View>
          <View className="flex-1 gap-1">
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              AI Financial Assistant
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Read-only answers grounded in your records.
            </Text>
          </View>
        </View>
        <Button
          accessibilityHint="Opens the consent-gated AI Financial Assistant"
          onPress={() => router.push("/(app)/assistant")}
        >
          Open AI Assistant
        </Button>
      </Card>

      <View style={styles.section}>
        <Text style={[typography.label, styles.sectionHeader, { color: theme.colors.textMuted }]}>
          FINANCIAL TOOLS
        </Text>
        <Card style={styles.groupedCard}>
          <MenuItem
            icon="wallet-outline"
            title="Accounts & categories"
            subtitle="Manage ledger accounts and category rules"
            onPress={() => router.push("/(app)/money-setup")}
          />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <MenuItem
            icon="file-document-outline"
            title="Import transactions"
            subtitle="Preview-first CSV and Excel file imports"
            onPress={() => router.push("/(app)/import")}
          />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <MenuItem
            icon="target"
            title="Savings goals"
            subtitle="Track progress toward target funds"
            onPress={() => router.push("/(app)/goals")}
          />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <MenuItem
            icon="credit-card-refund-outline"
            title="Debts"
            subtitle="Payoff schedules with avalanche & snowball"
            onPress={() => router.push("/(app)/debts")}
          />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <MenuItem
            icon="calendar-sync-outline"
            title="Subscriptions"
            subtitle="Recurring bills and renewal schedules"
            onPress={() => router.push("/(app)/subscriptions")}
          />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <MenuItem
            icon="calendar-month-outline"
            title="Calendar"
            subtitle="Combined financial agenda and due dates"
            onPress={() => router.push("/(app)/calendar")}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={[typography.label, styles.sectionHeader, { color: theme.colors.textMuted }]}>
          ACCOUNT & SERVICES
        </Text>
        <Card style={styles.groupedCard}>
          <MenuItem
            icon="star-outline"
            title="Plan & billing"
            subtitle="Subscription entitlements and usage"
            badge={isPro ? "PRO" : "FREE"}
            onPress={() => router.push("/(app)/plan-billing")}
          />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <MenuItem
            icon="help-circle-outline"
            title="Help & support"
            subtitle="Get assistance and report issues"
            onPress={() => router.push("/(app)/support")}
          />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <MenuItem
            icon="account-cog-outline"
            title="Account"
            subtitle="Identity, email, and deletion options"
            onPress={() => router.push("/(app)/account")}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={[typography.label, styles.sectionHeader, { color: theme.colors.textMuted }]}>
          APPEARANCE
        </Text>
        <Card>
          <ThemePicker />
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={[typography.label, styles.sectionHeader, { color: theme.colors.textMuted }]}>
          DEMO DATA
        </Text>
        <Card accessibilityLabel="Developer demo data generator">
          <View className="gap-3">
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              Populate realistic dummy transactions, accounts, budgets, goals, debts, and
              subscriptions into the local encrypted workspace.
            </Text>
            {seedSuccess ? (
              <Text style={[typography.body, { color: theme.colors.brand, fontWeight: "600" }]}>
                ✓ Demo transactions & data populated successfully!
              </Text>
            ) : null}
            <Button
              accessibilityHint="Inserts demo transactions and accounts into local encrypted database"
              disabled={!local.workspace || seeding}
              loading={seeding}
              variant="secondary"
              onPress={handleSeedData}
            >
              Seed dummy transactions & data
            </Button>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={[typography.label, styles.sectionHeader, { color: theme.colors.textMuted }]}>
          STORAGE & SECURITY
        </Text>
        <Card accessibilityLabel="Local data protection status">
          <View style={styles.securityRow}>
            <View
              accessibilityElementsHidden
              style={[styles.securityIconBox, { backgroundColor: theme.colors.brandSoft }]}
            >
              <MaterialCommunityIcons name="shield-lock-outline" size={20} color={theme.colors.brand} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.headline, { color: theme.colors.text }]}>Local data encrypted</Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                SQLCipher database · Schema version {local.workspace?.schemaVersion ?? "ready"}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      <OtaUpdateSettingsCard />
      <UpdateSettingsCard />

      <View style={styles.section}>
        <Text style={[typography.label, styles.sectionHeader, { color: theme.colors.textMuted }]}>
          SESSION
        </Text>
        <Card accessibilityLabel="Account session controls">
          <View className="gap-3">
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              Signing out removes this device&apos;s encrypted local copy after verifying sync
              status. Synced records remain safe in your workspace.
            </Text>
            {signOutError ? (
              <Text
                accessibilityRole="alert"
                style={[typography.body, { color: theme.colors.danger }]}
              >
                {signOutError}
              </Text>
            ) : null}
            <Button
              accessibilityHint="Checks for unsynchronized changes before removing the local workspace"
              disabled={!localStats.stats || signingOut}
              loading={signingOut}
              variant="secondary"
              onPress={() => setConfirmingSignOut(true)}
            >
              Sign out
            </Button>
          </View>
        </Card>
      </View>

      <ConfirmationDialog
        confirmLabel={unsyncedCount > 0 ? "Discard and sign out" : "Sign out"}
        destructive={unsyncedCount > 0}
        message={
          unsyncedCount > 0
            ? `${unsyncedCount} local change${unsyncedCount === 1 ? " has" : "s have"} not been safely synchronized. Signing out now permanently removes that work from this device.`
            : "Your encrypted local copy will be removed from this device. Records already synchronized with Zoption will remain available when you sign in again."
        }
        title={unsyncedCount > 0 ? "Discard local changes?" : "Sign out of Zoption?"}
        visible={confirmingSignOut}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => void confirmSignOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    paddingHorizontal: spacing.xs,
    letterSpacing: 0.8,
    fontSize: 12,
  },
  groupedCard: {
    padding: 0,
    gap: 0,
    overflow: "hidden",
  },
  menuItem: {
    minHeight: touchTarget + spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  menuIconColumn: {
    width: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
  assistantCard: {
    borderWidth: 1,
  },
  assistantIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  securityIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
