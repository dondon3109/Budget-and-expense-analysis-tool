import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { isDevelopmentAppVariant } from "@/config/app-variant";
import { BrandMark } from "@/ui/brand-mark";
import { Button } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

/** Signed-out landing: brand, one headline, and the sign-in action. Fits one screen without scrolling. */
export function WelcomeScreen() {
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
    <Screen title="Your money, in your hands." scroll={false} showHeading={false}>
      <View style={styles.header}>
        <BrandMark />
      </View>

      <View style={styles.hero}>
        <Text accessibilityRole="header" style={[styles.headline, { color: theme.colors.text }]}>
          Your money,{"\n"}in your hands.
        </Text>
        <Text style={[typography.body, styles.subline, { color: theme.colors.textMuted }]}>
          Private, offline-first budgeting built for the peso.
        </Text>
      </View>

      <View style={styles.actions}>
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
        <Text style={[typography.caption, styles.footnote, { color: theme.colors.textMuted }]}>
          Encrypted on your device · Same account on web and mobile
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "flex-start" },
  hero: { flex: 1, justifyContent: "center", gap: spacing.md },
  headline: {
    ...typography.display,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.5,
  },
  subline: { maxWidth: 320 },
  actions: { gap: spacing.sm },
  footnote: { textAlign: "center", marginTop: spacing.xs },
});
