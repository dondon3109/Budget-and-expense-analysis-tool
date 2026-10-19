import {
  FAMILY_JOIN_COOLDOWN_DAYS,
  FAMILY_MEMBERSHIP_LIMIT,
  FAMILY_SEAT_COOLDOWN_DAYS,
  FAMILY_SEAT_LIMIT,
  FAMILY_SWAP_LIMIT_PER_YEAR,
} from "@zoption/shared";
import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

/** The confirm button stays locked this long so the rules are seen, not tapped through. */
const READ_SECONDS = 10;

const RULES = [
  `The owner and every pending invitation each take one of the ${FAMILY_SEAT_LIMIT} seats.`,
  `When someone leaves or is removed, their seat stays empty for ${FAMILY_SEAT_COOLDOWN_DAYS} days.`,
  `After ${FAMILY_SWAP_LIMIT_PER_YEAR} seats have been freed within a year, the family cannot invite anyone new until the oldest of those is a year old.`,
  `A person can join a different family at most once every ${FAMILY_JOIN_COOLDOWN_DAYS} days, and belong to ${FAMILY_MEMBERSHIP_LIMIT} families at most.`,
  "Entries someone added stay in the family after they leave; their access ends right away.",
];

/**
 * The seat rules, shown before creating a family, accepting an invitation, or removing a member.
 * The Worker refuses those three calls without the acknowledgement this dialog stands for.
 * Mount it only while it is shown, so the read timer starts over each time.
 */
export function SeatRulesDialog({
  title,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const theme = useZoptionTheme();
  const [secondsLeft, setSecondsLeft] = useState(READ_SECONDS);
  useEffect(() => {
    if (secondsLeft === 0) return;
    const timer = setTimeout(() => setSecondsLeft((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);
  const text = { color: theme.colors.text };

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      statusBarTranslucent
      onRequestClose={busy ? undefined : onClose}
      transparent
      visible
    >
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        <View
          style={[
            styles.dialog,
            elevation.dialog,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <Text accessibilityRole="header" style={[typography.title, text]}>
            {title}
          </Text>
          <ScrollView contentContainerStyle={{ gap: spacing.xs }} style={styles.body}>
            <Text style={[typography.body, text]}>
              A family shares one budget between up to {FAMILY_SEAT_LIMIT} people.
            </Text>
            {RULES.map((rule) => (
              <Text key={rule} style={[typography.callout, { color: theme.colors.textMuted }]}>
                • {rule}
              </Text>
            ))}
            <Text style={[typography.body, text]}>
              Your personal budget is never visible to the family.
            </Text>
          </ScrollView>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[typography.callout, { color: theme.colors.danger }]}
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button disabled={busy} onPress={onClose} variant="quiet">
              Cancel
            </Button>
            <Button disabled={secondsLeft > 0} loading={busy} onPress={onConfirm}>
              {secondsLeft > 0 ? `${confirmLabel} (${secondsLeft})` : confirmLabel}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  dialog: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  body: { flexGrow: 0 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs },
});
