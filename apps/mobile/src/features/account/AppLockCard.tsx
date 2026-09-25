import { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";

import {
  PIN_LENGTH,
  clearAppLock,
  readAppLockKind,
  setAppLock,
  verifyAppLock,
} from "@/auth/app-lock";
import { PinPadScreen, PinSetupScreen } from "@/features/app-lock/PinPad";
import { Button, Card, SkeletonLines } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

/** Which full-screen PIN step is open. Changing and turning off check the current PIN first. */
type PinStep = "create" | "verify-to-change" | "verify-to-turn-off";

export function AppLockCard({ subject }: { subject: string }) {
  const theme = useZoptionTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<PinStep | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});

  useEffect(() => {
    let active = true;
    readAppLockKind(subject)
      .then((kind) => {
        if (active) setEnabled(kind !== null);
      })
      .catch(() => {
        if (active) setFeedback({ error: "Zoption could not read the app lock setting." });
      });
    return () => {
      active = false;
    };
  }, [subject]);

  const open = (next: PinStep): void => {
    setPin("");
    setPinError(null);
    setFeedback({});
    setStep(next);
  };

  const close = (): void => {
    setPin("");
    setPinError(null);
    setStep(null);
  };

  const verifyCurrent = async (attempt: string): Promise<void> => {
    setChecking(true);
    try {
      if (!(await verifyAppLock(subject, attempt))) {
        setPin("");
        setPinError("Incorrect PIN. Try again.");
        return;
      }
      if (step === "verify-to-change") {
        open("create");
        return;
      }
      await clearAppLock(subject);
      setEnabled(false);
      close();
      setFeedback({ success: "App lock is off." });
    } catch {
      setPin("");
      setPinError("Zoption could not check the PIN. Try again.");
    } finally {
      setChecking(false);
    }
  };

  const cancel = (
    <Button variant="quiet" onPress={close}>
      Cancel
    </Button>
  );

  return (
    <Card accessibilityLabel="App lock settings">
      <View className="gap-3">
        <Text style={[typography.headline, { color: theme.colors.text }]}>App lock</Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Ask for a {PIN_LENGTH}-digit PIN whenever Zoption opens or returns after a minute away. It
          works offline and applies to this device only. If you forget it, sign out and sign in
          again.
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
          <View className="gap-2">
            <Button variant="secondary" onPress={() => open("verify-to-change")}>
              Change PIN
            </Button>
            <Button variant="quiet" onPress={() => open("verify-to-turn-off")}>
              Turn off app lock
            </Button>
          </View>
        ) : (
          <Button onPress={() => open("create")}>Turn on app lock</Button>
        )}
      </View>

      <Modal animationType="slide" visible={step !== null} onRequestClose={close}>
        {step === "create" ? (
          <PinSetupScreen
            footer={cancel}
            onSave={async (next) => {
              await setAppLock(subject, next);
              setEnabled(true);
              close();
              setFeedback({
                success: "App lock is on. Zoption asks for this PIN when it opens.",
              });
            }}
          />
        ) : step !== null ? (
          <PinPadScreen
            title="Enter your current PIN"
            message={
              step === "verify-to-change"
                ? "Confirm it's you before choosing a new PIN."
                : "Confirm it's you before turning off app lock."
            }
            value={pin}
            onChange={(next) => {
              setPinError(null);
              setPin(next);
              if (next.length === PIN_LENGTH) void verifyCurrent(next);
            }}
            error={pinError}
            disabled={checking}
            footer={cancel}
          />
        ) : null}
      </Modal>
    </Card>
  );
}
