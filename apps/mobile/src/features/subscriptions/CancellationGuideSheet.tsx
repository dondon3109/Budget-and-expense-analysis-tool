import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CANCELLATION_GUIDES, findCancellationGuide } from "@zoption/shared";
import { useMemo } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export interface CancellationGuideSheetProps {
  subscriptionName: string | null;
  visible: boolean;
  onDismiss: () => void;
}

export type CancellationDifficulty = "Easy" | "Moderate" | "Involved";

// The shared guide catalog does not ship a difficulty score, so derive a
// transparent effort label from the published step count instead.
export function getCancellationDifficulty(stepCount: number): CancellationDifficulty {
  if (stepCount <= 3) return "Easy";
  if (stepCount <= 5) return "Moderate";
  return "Involved";
}

function formatCategory(category: string): string {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const GENERIC_CUTOFF_ADVICE =
  "Most subscription services require cancellation at least 24 to 48 hours before the renewal date to avoid being billed for the next period.";

export function CancellationGuideSheet({
  subscriptionName,
  visible,
  onDismiss,
}: CancellationGuideSheetProps) {
  const theme = useZoptionTheme();
  const guide = useMemo(
    () => (subscriptionName ? findCancellationGuide(subscriptionName) : null),
    [subscriptionName],
  );
  const storeGuides = useMemo(
    () => CANCELLATION_GUIDES.filter((entry) => entry.id === "apple" || entry.id === "google_play"),
    [],
  );
  const difficulty = guide ? getCancellationDifficulty(guide.steps.length) : null;

  const openPortal = (url: string): void => {
    void Linking.openURL(url);
  };

  return (
    <BottomSheet title="How to cancel" visible={visible} onDismiss={onDismiss}>
      {guide ? (
        <View style={styles.stack}>
          <View style={styles.pillRow}>
            <View
              accessibilityLabel={`Difficulty: ${difficulty}`}
              style={[styles.pill, { backgroundColor: theme.colors.brandSoft }]}
            >
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.brand}
                name="speedometer"
                size={14}
              />
              <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}>
                {difficulty}
              </Text>
            </View>
            <View style={[styles.pill, { backgroundColor: theme.colors.surface }]}>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {formatCategory(guide.category)} · {guide.steps.length} steps
              </Text>
            </View>
          </View>

          <View style={styles.headingGroup}>
            <Text
              accessibilityRole="header"
              style={[typography.title, { color: theme.colors.text }]}
            >
              {guide.name}
            </Text>
            {subscriptionName && subscriptionName !== guide.name ? (
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                For {subscriptionName}
              </Text>
            ) : null}
          </View>

          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            {guide.summary}
          </Text>

          {guide.directUrl ? (
            <Button
              accessibilityLabel="Open official cancellation portal"
              icon="open-in-new"
              onPress={() => openPortal(guide.directUrl as string)}
              variant="primary"
            >
              Open official cancellation portal
            </Button>
          ) : null}

          <View
            accessibilityRole="alert"
            style={[styles.warningCard, { backgroundColor: theme.colors.warningSoft }]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.warning}
              name="clock-alert-outline"
              size={20}
            />
            <View style={styles.warningCopy}>
              <Text style={[typography.label, { color: theme.colors.text }]}>
                Billing cutoff notice
              </Text>
              <Text style={[typography.callout, { color: theme.colors.text }]}>
                {guide.cutoffWarning}
              </Text>
            </View>
          </View>

          <View style={styles.stepsGroup}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Step-by-step instructions
            </Text>
            <View accessibilityLabel="Cancellation steps" style={styles.stepsList}>
              {guide.steps.map((step, index) => (
                <View key={`${guide.id}-step-${index}`} style={styles.stepRow}>
                  <View
                    accessibilityElementsHidden
                    style={[styles.stepBadge, { backgroundColor: theme.colors.brandSoft }]}
                  >
                    <Text
                      style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <Text style={[typography.body, styles.stepText, { color: theme.colors.text }]}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          <View style={styles.headingGroup}>
            <Text
              accessibilityRole="header"
              style={[typography.title, { color: theme.colors.text }]}
            >
              General cancellation steps
            </Text>
            {subscriptionName ? (
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                No saved guide for {subscriptionName} yet
              </Text>
            ) : null}
          </View>

          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            We do not have a direct guide on file
            {subscriptionName ? (
              <>
                {" "}
                for <Text style={{ fontWeight: "700" }}>{subscriptionName}</Text>
              </>
            ) : null}
            , but these standard steps stop most recurring charges.
          </Text>

          <View
            accessibilityRole="alert"
            style={[styles.warningCard, { backgroundColor: theme.colors.warningSoft }]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.warning}
              name="clock-alert-outline"
              size={20}
            />
            <View style={styles.warningCopy}>
              <Text style={[typography.label, { color: theme.colors.text }]}>
                Billing cycle notice
              </Text>
              <Text style={[typography.callout, { color: theme.colors.text }]}>
                {GENERIC_CUTOFF_ADVICE}
              </Text>
            </View>
          </View>

          <View accessibilityLabel="Cancellation steps" style={styles.stepsList}>
            {[
              "Identify the billing channel: the merchant website, Apple App Store, Google Play Store, or GCash/Maya AutoPay.",
              "Log in to the service app or website and open Account Settings, then Subscriptions or Billing.",
              "Select Cancel Subscription or turn off auto-renewal, and keep the confirmation email or screenshot.",
            ].map((step, index) => (
              <View key={`generic-step-${index}`} style={styles.stepRow}>
                <View
                  accessibilityElementsHidden
                  style={[styles.stepBadge, { backgroundColor: theme.colors.brandSoft }]}
                >
                  <Text
                    style={[typography.caption, { color: theme.colors.brand, fontWeight: "700" }]}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text style={[typography.body, styles.stepText, { color: theme.colors.text }]}>
                  {step}
                </Text>
              </View>
            ))}
          </View>

          {storeGuides.length > 0 ? (
            <View style={styles.storeGroup}>
              <Text style={[typography.label, { color: theme.colors.text }]}>
                Billed through an app store?
              </Text>
              {storeGuides.map((store) =>
                store.directUrl ? (
                  <Button
                    key={store.id}
                    accessibilityLabel={`Open ${store.name} subscriptions portal`}
                    icon="open-in-new"
                    onPress={() => openPortal(store.directUrl as string)}
                    variant="secondary"
                  >
                    {store.name}
                  </Button>
                ) : null,
              )}
            </View>
          ) : null}
        </View>
      )}

      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Marking a subscription as canceled in Zoption only updates your local budget — it does not
        contact the merchant for you.
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
  },
  headingGroup: { gap: 2 },
  warningCard: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  warningCopy: { flex: 1, gap: 2 },
  stepsGroup: { gap: spacing.sm },
  stepsList: { gap: spacing.sm },
  stepRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { flex: 1 },
  storeGroup: { gap: spacing.sm },
});
