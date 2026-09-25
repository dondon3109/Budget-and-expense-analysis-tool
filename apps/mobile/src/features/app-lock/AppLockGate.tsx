import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  PIN_LENGTH,
  readAppLockKind,
  setAppLock,
  verifyAppLock,
  type AppLockKind,
} from "@/auth/app-lock";
import { useSessionSnapshot } from "@/auth/session-state";
import { UnsyncedChangesError } from "@/auth/sign-out-policy";
import { Button, ConfirmationDialog, FormField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { PinPadScreen, PinSetupScreen } from "./PinPad";

/** A short trip out (camera, share sheet, Google sign-in) does not re-lock. */
export const RELOCK_AFTER_MS = 60_000;
export const MAX_ATTEMPTS = 5;
export const ATTEMPT_COOLDOWN_MS = 30_000;

type LockState = "checking" | "unlocked" | AppLockKind;

/**
 * Holds the signed-in app behind the user's PIN when they set one. Children
 * stay mounted under the lock, so re-locking after time away keeps navigation
 * and unsaved form input.
 */
export function AppLockGate({ subject, children }: PropsWithChildren<{ subject: string }>) {
  const theme = useZoptionTheme();
  const [lockState, setLockState] = useState<LockState>("checking");

  useEffect(() => {
    let active = true;
    readAppLockKind(subject)
      .then((kind) => {
        if (active) setLockState(kind ?? "unlocked");
      })
      .catch(() => {
        // Fail closed: an unreadable lock store keeps the workspace covered.
        if (active) setLockState("pin");
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
      void readAppLockKind(subject)
        .then((kind) => {
          if (kind) setLockState(kind);
        })
        .catch(() => setLockState("pin"));
    });
    return () => subscription.remove();
  }, [subject]);

  if (lockState === "checking") {
    return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }} />;
  }
  const locked = lockState === "pin" || lockState === "password";
  return (
    <>
      {children}
      <Modal
        animationType="none"
        visible={locked}
        // The lock has no dismiss: Android back must not reveal the app.
        onRequestClose={() => undefined}
      >
        {locked ? (
          <AppLockScreen
            subject={subject}
            kind={lockState}
            onUnlock={() => setLockState("unlocked")}
          />
        ) : null}
      </Modal>
    </>
  );
}

function AppLockScreen({
  subject,
  kind,
  onUnlock,
}: {
  subject: string;
  kind: AppLockKind;
  onUnlock: () => void;
}) {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const failuresRef = useRef(0);
  // A legacy app password unlocks once, then must be replaced with a PIN.
  const [replacingPassword, setReplacingPassword] = useState(false);
  const [signOutStep, setSignOutStep] = useState<"idle" | "confirm" | "discard">("idle");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), ATTEMPT_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [coolingDown]);

  const unlock = async (attempt: string): Promise<void> => {
    if (checking || coolingDown || attempt.length === 0) return;
    setChecking(true);
    try {
      if (await verifyAppLock(subject, attempt)) {
        failuresRef.current = 0;
        setSecret("");
        setError(null);
        if (kind === "password") {
          setReplacingPassword(true);
          return;
        }
        onUnlock();
        return;
      }
      failuresRef.current += 1;
      setSecret("");
      if (failuresRef.current >= MAX_ATTEMPTS) {
        failuresRef.current = 0;
        setCoolingDown(true);
        setError(`Too many attempts. Try again in ${ATTEMPT_COOLDOWN_MS / 1000} seconds.`);
        return;
      }
      setError(kind === "pin" ? "Incorrect PIN. Try again." : "That password is not correct.");
    } catch {
      setError("Zoption could not check it. Try again.");
    } finally {
      setChecking(false);
    }
  };

  const signOut = async (discardUnsyncedChanges: boolean): Promise<void> => {
    setSignOutStep("idle");
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

  if (replacingPassword) {
    return (
      <PinSetupScreen
        onSave={async (pin) => {
          await setAppLock(subject, pin);
          onUnlock();
        }}
      />
    );
  }

  const signOutControls = (
    <>
      <Button variant="quiet" loading={signingOut} onPress={() => setSignOutStep("confirm")}>
        {kind === "pin" ? "Forgot PIN? Sign out" : "Forgot password? Sign out"}
      </Button>
      <ConfirmationDialog
        visible={signOutStep !== "idle"}
        title={signOutStep === "discard" ? "Delete unsynced changes?" : "Sign out?"}
        message={
          signOutStep === "discard"
            ? "This device has changes Zoption has not received yet. Signing out now deletes them."
            : "Signing out removes this device's copy of your workspace and its app lock. Sign in again to download your synced data."
        }
        confirmLabel={
          signOutStep === "discard" ? "Delete unsynced changes and sign out" : "Sign out"
        }
        destructive
        onCancel={() => setSignOutStep("idle")}
        onConfirm={() => void signOut(signOutStep === "discard")}
      />
    </>
  );

  if (kind === "pin") {
    return (
      <PinPadScreen
        title="Zoption is locked"
        message="Enter your PIN to open your workspace."
        value={secret}
        onChange={(next) => {
          setError(null);
          setSecret(next);
          if (next.length === PIN_LENGTH) void unlock(next);
        }}
        error={error}
        disabled={checking || coolingDown || signingOut}
        footer={signOutControls}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.md, padding: spacing.lg }}>
        <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
          Zoption is locked
        </Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          App lock now uses a PIN. Enter your app password once, then choose a {PIN_LENGTH}-digit
          PIN to replace it.
        </Text>
        <FormField
          label="App password"
          value={secret}
          onChangeText={setSecret}
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!coolingDown}
          returnKeyType="done"
          onSubmitEditing={() => void unlock(secret)}
        />
        {error ? (
          <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.danger }]}>
            {error}
          </Text>
        ) : null}
        <Button
          loading={checking}
          disabled={coolingDown || secret.length === 0}
          onPress={() => void unlock(secret)}
        >
          Continue
        </Button>
        {signOutControls}
      </View>
    </SafeAreaView>
  );
}
