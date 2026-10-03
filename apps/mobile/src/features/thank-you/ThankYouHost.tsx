import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSyncExternalStore } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

/** One message per finished task. Keep in step with apps/web/src/lib/thankYou.ts. */
const thankYouCopy = {
  signup: {
    icon: "check-circle-outline",
    title: "Thank you for creating your account",
    description:
      "Your private financial workspace is ready. Start by logging an expense with voice, snapping a receipt, or mapping your first bank statement.",
  },
  pro: {
    icon: "star-four-points-outline",
    title: "Thank you for upgrading to Zoption Pro!",
    description:
      "Your workspace now includes 10 statement imports per month, automatic interest compounding, the interactive renewal calendar, and direct priority support.",
  },
} as const;

export type ThankYouFlow = keyof typeof thankYouCopy;

let currentFlow: ThankYouFlow | null = null;
const listeners = new Set<() => void>();

function publish(flow: ThankYouFlow | null): void {
  currentFlow = flow;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Raises the thank-you card. It waits for the host if the app is still opening the workspace. */
export function showThankYou(flow: ThankYouFlow): void {
  publish(flow);
}

/**
 * A Supabase user whose first sign-in is the one that just happened was created by it.
 * Used after Google sign-in, the only way to create an account on mobile.
 */
export function isNewAccount(user: { created_at: string; last_sign_in_at?: string }): boolean {
  if (!user.last_sign_in_at) return false;
  const gap = Date.parse(user.last_sign_in_at) - Date.parse(user.created_at);
  return Number.isFinite(gap) && Math.abs(gap) < 60_000;
}

/** Mounted once in the authenticated gate so every screen shares one card. */
export function ThankYouHost() {
  const theme = useZoptionTheme();
  const flow = useSyncExternalStore(subscribe, () => currentFlow);
  const copy = flow ? thankYouCopy[flow] : null;
  const close = () => publish(null);

  return (
    <Modal animationType="fade" transparent visible={copy !== null} onRequestClose={close}>
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        {copy && (
          <View
            accessibilityRole="alert"
            style={[
              styles.card,
              elevation.dialog,
              { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: theme.colors.brandSoft }]}>
              <MaterialCommunityIcons name={copy.icon} size={28} color={theme.colors.brand} />
            </View>
            <Text
              accessibilityRole="header"
              style={[typography.title, styles.centered, { color: theme.colors.text }]}
            >
              {copy.title}
            </Text>
            <Text style={[typography.body, styles.centered, { color: theme.colors.textMuted }]}>
              {copy.description}
            </Text>
            <Button variant="primary" onPress={close}>
              Continue
            </Button>
          </View>
        )}
      </View>
    </Modal>
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
});
