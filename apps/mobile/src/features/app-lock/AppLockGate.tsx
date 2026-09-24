import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { hasAppLock, verifyAppLock } from "@/auth/app-lock";
import { useSessionSnapshot } from "@/auth/session-state";
import { UnsyncedChangesError } from "@/auth/sign-out-policy";
import { Button, FormField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

/** A short trip out (camera, share sheet, Google sign-in) does not re-lock. */
export const RELOCK_AFTER_MS = 60_000;
export const MAX_ATTEMPTS = 5;
export const ATTEMPT_COOLDOWN_MS = 30_000;

type LockState = "checking" | "locked" | "unlocked";

/**
 * Holds the signed-in app behind the user's app password when they set one.
 * Children stay mounted under the lock, so re-locking after time away keeps
 * navigation and unsaved form input.
 */
export function AppLockGate({ subject, children }: PropsWithChildren<{ subject: string }>) {
  const theme = useZoptionTheme();
  const [lockState, setLockState] = useState<LockState>("checking");

  useEffect(() => {
    let active = true;
    hasAppLock(subject)
      .then((locked) => {
        if (active) setLockState(locked ? "locked" : "unlocked");
      })
      .catch(() => {
        // Fail closed: an unreadable lock store keeps the workspace covered.
        if (active) setLockState("locked");
      });
    return () => {
      active = false;
    };
  }, [subject]);

  useEffect(() => {
    let backgroundedAt: number | null = null;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        backgroundedAt = Date.now();
        return;
      }
      if (next !== "active" || backgroundedAt === null) return;
      const away = Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (away < RELOCK_AFTER_MS) return;
      void hasAppLock(subject)
        .then((locked) => {
          if (locked) setLockState("locked");
        })
        .catch(() => setLockState("locked"));
    });
    return () => subscription.remove();
  }, [subject]);

  if (lockState === "checking") {
    return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }} />;
  }
  return (
    <>
      {children}
      <Modal
        animationType="none"
        visible={lockState === "locked"}
        // The lock has no dismiss: Android back must not reveal the app.
        onRequestClose={() => undefined}
      >
        <AppLockScreen subject={subject} onUnlock={() => setLockState("unlocked")} />
      </Modal>
    </>
  );
}

function AppLockScreen({ subject, onUnlock }: { subject: string; onUnlock: () => void }) {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const failuresRef = useRef(0);
  const [signOutStep, setSignOutStep] = useState<"idle" | "confirm" | "discard">("idle");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), ATTEMPT_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [coolingDown]);

  const unlock = async (): Promise<void> => {
    if (checking || coolingDown || password.length === 0) return;
    setChecking(true);
    try {
      if (await verifyAppLock(subject, password)) {
        failuresRef.current = 0;
        setPassword("");
        setError(null);
        onUnlock();
        return;
      }
      failuresRef.current += 1;
      setPassword("");
      if (failuresRef.current >= MAX_ATTEMPTS) {
        failuresRef.current = 0;
        setCoolingDown(true);
        setError(
          `Too many attempts. Try again in ${ATTEMPT_COOLDOWN_MS / 1000} seconds, or sign out.`,
        );
        return;
      }
      setError("That password is not correct.");
    } catch {
      setError("Zoption could not check the password. Try again.");
    } finally {
      setChecking(false);
    }
  };

  const signOut = async (discardUnsyncedChanges: boolean): Promise<void> => {
    setSigningOut(true);
    setError(null);
    try {
      await session.signOut({ discardUnsyncedChanges });
    } catch (signOutError) {
      if (signOutError instanceof UnsyncedChangesError) {
        setSignOutStep("discard");
        return;
      }
      setError(
        signOutError instanceof Error ? signOutError.message : "Zoption could not sign you out.",
      );
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.md, padding: spacing.lg }}>
        <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
          Zoption is locked
        </Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Enter your app password to open your workspace.
        </Text>
        <FormField
          label="App password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!coolingDown}
          returnKeyType="done"
          onSubmitEditing={() => void unlock()}
        />
        {error ? (
          <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.danger }]}>
            {error}
          </Text>
        ) : null}
        <Button
          loading={checking}
          disabled={coolingDown || password.length === 0}
          onPress={() => void unlock()}
        >
          Unlock
        </Button>

        {signOutStep === "idle" ? (
          <Button variant="quiet" onPress={() => setSignOutStep("confirm")}>
            Forgot password? Sign out
          </Button>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              {signOutStep === "discard"
                ? "This device has changes Zoption has not received yet. Signing out now deletes them."
                : "Signing out removes this device's copy of your workspace and its app password. Sign in again to download your synced data."}
            </Text>
            <Button
              variant="danger"
              loading={signingOut}
              onPress={() => void signOut(signOutStep === "discard")}
            >
              {signOutStep === "discard" ? "Delete unsynced changes and sign out" : "Sign out"}
            </Button>
            <Button variant="quiet" onPress={() => setSignOutStep("idle")}>
              Cancel
            </Button>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
