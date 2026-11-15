import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/ui/components";
import { useReduceMotion } from "@/ui/reduce-motion";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";
import { withTapSound } from "@/features/sounds/sound-effects";

/**
 * One message per finished task. Pro keeps in step with apps/web/src/lib/thankYou.ts; goal is
 * mobile only. A new account is thanked by the Final step of first-run setup instead.
 */
const thankYouCopy = {
  pro: {
    icon: "star-four-points-outline",
    eyebrow: "Membership",
    title: "Thank you for upgrading Zoption!",
    description:
      "Your plan now includes more AI actions and statement imports, automatic interest compounding, the interactive bill calendar, and direct support.",
  },
  goal: {
    icon: "heart-outline",
    eyebrow: "Your goals",
    title: "Thank you!",
    description:
      "Thanks for taking a moment to tell us. We've set Zoption up around what matters to you.",
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

/** Whether the thank-you card is open, so another dialog can wait for it to close. */
export function useThankYouOpen(): boolean {
  return useSyncExternalStore(subscribe, () => currentFlow) !== null;
}

/** Mounted once in the authenticated gate so every screen shares one card. */
export function ThankYouHost() {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const flow = useSyncExternalStore(subscribe, () => currentFlow);
  const copy = flow ? thankYouCopy[flow] : null;
  const close = () => publish(null);
  const pop = useRef(new Animated.Value(0)).current;

  // The card rises and settles while the scrim fades in, so it reads as a moment, not an alert.
  useEffect(() => {
    if (!flow) return;
    if (reduceMotion) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }).start();
  }, [flow, pop, reduceMotion]);

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      statusBarTranslucent
      transparent
      visible={copy !== null}
      onRequestClose={close}
    >
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={withTapSound(close)}
        />
        {copy && (
          <Animated.View
            accessibilityRole="alert"
            style={[
              styles.card,
              elevation.dialog,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
                opacity: pop,
                transform: [
                  { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                  { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                ],
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: theme.colors.brandSoft }]}>
              <MaterialCommunityIcons name={copy.icon} size={36} color={theme.colors.brand} />
            </View>
            <View style={styles.copy}>
              <Text style={[typography.label, styles.centered, { color: theme.colors.brand }]}>
                {copy.eyebrow}
              </Text>
              <Text
                accessibilityRole="header"
                style={[typography.title, styles.centered, { color: theme.colors.text }]}
              >
                {copy.title}
              </Text>
              <Text style={[typography.body, styles.centered, { color: theme.colors.textMuted }]}>
                {copy.description}
              </Text>
            </View>
            <Button variant="primary" onPress={close}>
              Continue
            </Button>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
    alignItems: "stretch",
  },
  icon: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { gap: spacing.xs },
  centered: { textAlign: "center" },
});
