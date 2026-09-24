import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import {
  APP_LOCK_MIN_LENGTH,
  clearAppLock,
  hasAppLock,
  setAppLock,
  verifyAppLock,
} from "@/auth/app-lock";
import { Button, Card, FormField, SkeletonLines } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export function AppLockCard({ subject }: { subject: string }) {
  const theme = useZoptionTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});

  useEffect(() => {
    let active = true;
    hasAppLock(subject)
      .then((locked) => {
        if (active) setEnabled(locked);
      })
      .catch(() => {
        if (active) setFeedback({ error: "Zoption could not read the app lock setting." });
      });
    return () => {
      active = false;
    };
  }, [subject]);

  const reset = (next: boolean, success: string): void => {
    setEnabled(next);
    setPassword("");
    setConfirmation("");
    setFeedback({ success });
  };

  const turnOn = async (): Promise<void> => {
    if (password.length < APP_LOCK_MIN_LENGTH) {
      setFeedback({ error: `Use at least ${APP_LOCK_MIN_LENGTH} characters.` });
      return;
    }
    if (password !== confirmation) {
      setFeedback({ error: "The passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      await setAppLock(subject, password);
      reset(true, "App lock is on. Zoption asks for this password when it opens.");
    } catch {
      setFeedback({ error: "Zoption could not save the app password. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (): Promise<void> => {
    setBusy(true);
    try {
      if (!(await verifyAppLock(subject, password))) {
        setFeedback({ error: "That password is not correct." });
        return;
      }
      await clearAppLock(subject);
      reset(false, "App lock is off.");
    } catch {
      setFeedback({ error: "Zoption could not turn off the app lock. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card accessibilityLabel="App lock settings">
      <View className="gap-3">
        <Text style={[typography.headline, { color: theme.colors.text }]}>App lock</Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Ask for a password whenever Zoption opens or returns after a minute away. It works offline
          and applies to this device only. If you forget it, sign out and sign in again.
        </Text>
        {feedback.error ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            {feedback.error}
          </Text>
        ) : null}
        {feedback.success ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.caption, { color: theme.colors.brand }]}
          >
            {feedback.success}
          </Text>
        ) : null}
        {enabled === null ? (
          <SkeletonLines lines={1} />
        ) : enabled ? (
          <>
            <FormField
              label="Current app password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
            <Button
              variant="secondary"
              loading={busy}
              disabled={password.length === 0}
              onPress={() => void turnOff()}
            >
              Turn off app lock
            </Button>
          </>
        ) : (
          <>
            <FormField
              label="New app password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              hint={`At least ${APP_LOCK_MIN_LENGTH} characters.`}
            />
            <FormField
              label="Confirm app password"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
            <Button loading={busy} onPress={() => void turnOn()}>
              Turn on app lock
            </Button>
          </>
        )}
      </View>
    </Card>
  );
}
