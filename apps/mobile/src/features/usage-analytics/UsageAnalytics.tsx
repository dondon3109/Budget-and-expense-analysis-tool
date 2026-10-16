import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Linking, Modal, StyleSheet, Switch, Text, View } from "react-native";

import { useThankYouOpen } from "@/features/thank-you/ThankYouHost";
import { chooseAccountLink, useAccountLink } from "@/telemetry/account-link";
import { Button, CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, touchTarget, typography } from "@/ui/tokens";

const PRIVACY_POLICY_URL = "https://zoption.site/privacy-policy";

/** Keep in step with the web's Analytics consent copy (CookiePreferencesDialog). */
const DESCRIPTION =
  "Zoption sends PostHog which screens you open, that you added or changed a record, and crash reports. Allow us to link them to your account ID and email so we can see where you get stuck and help when you contact support. Amounts, categories, and anything you type are never sent.";

function PrivacyPolicyLink() {
  const theme = useZoptionTheme();
  return (
    <Text
      accessibilityRole="link"
      onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
      style={[typography.caption, { color: theme.colors.brand, textDecorationLine: "underline" }]}
    >
      Read the Privacy Policy
    </Text>
  );
}

/**
 * Asks a signed-in account once per device whether to link usage analytics to
 * it, like the web's Analytics consent. It waits for the thank-you card, since
 * two native modals cannot open at once.
 */
export function UsageAnalyticsPromptHost() {
  const theme = useZoptionTheme();
  const { needsChoice } = useAccountLink();
  const thankYouOpen = useThankYouOpen();
  const visible = needsChoice && !thankYouOpen;
  const decline = () => void chooseAccountLink("declined");

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={decline}>
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            elevation.dialog,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: theme.colors.brandSoft }]}>
            <MaterialCommunityIcons name="chart-line" size={28} color={theme.colors.brand} />
          </View>
          <Text
            accessibilityRole="header"
            style={[typography.title, styles.centered, { color: theme.colors.text }]}
          >
            Help improve Zoption
          </Text>
          <Text style={[typography.body, styles.centered, { color: theme.colors.textMuted }]}>
            {DESCRIPTION}
          </Text>
          <Text style={[typography.caption, styles.centered, { color: theme.colors.textMuted }]}>
            You can change this any time in More, Usage analytics.
          </Text>
          <View style={styles.centeredRow}>
            <PrivacyPolicyLink />
          </View>
          <Button variant="primary" onPress={() => void chooseAccountLink("granted")}>
            Allow
          </Button>
          <Button variant="secondary" onPress={decline}>
            Not now
          </Button>
        </View>
      </View>
    </Modal>
  );
}

/** The same choice in Preferences, for signed-in accounts only. */
export function UsageAnalyticsCard() {
  const theme = useZoptionTheme();
  const { signedIn, choice } = useAccountLink();
  if (!signedIn) return null;
  const granted = choice === "granted";

  return (
    <CollapsibleCard
      title="Usage analytics"
      summary={granted ? "Linked" : "Not linked"}
      icon="chart-line"
    >
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{DESCRIPTION}</Text>
      <View style={styles.option}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Link to my account</Text>
        <Switch
          accessibilityLabel="Link usage analytics to my account"
          value={granted}
          onValueChange={(next) => void chooseAccountLink(next ? "granted" : "declined")}
          trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
        />
      </View>
      <PrivacyPolicyLink />
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: "stretch",
  },
  icon: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: { textAlign: "center" },
  centeredRow: { alignItems: "center" },
  option: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: touchTarget,
    gap: spacing.sm,
  },
});
