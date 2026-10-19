import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { CURRENT_RECEIPT_CONSENT_VERSION, type TransactionVoiceDraft } from "@zoption/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from "react-native";

import { extractVoiceTransaction, extractVoiceTransactionFromTranscript } from "@/api/ai-entry";
import { ApiTransportError } from "@/api/authenticated";
import { getReceiptPreferences, grantReceiptConsent } from "@/api/receipt-scan";
import { useSessionSnapshot } from "@/auth/session-state";
import { useAccountGate } from "@/features/account-prompt/use-account-gate";
import { useVoiceRecorder } from "@/features/assistant/assistant-voice-hooks";
import { useVoiceLanguageStore } from "@/stores/voice-language-store";
import { Button, Card, ConfirmationDialog } from "@/ui/components";
import { useReduceMotion } from "@/ui/reduce-motion";
import { radii, spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

type EntryReadiness = "checking" | "needs-consent" | "ready" | "unavailable";

export function TransactionVoiceEntry({
  disabled,
  onDraft,
  categories,
}: {
  disabled?: boolean;
  onDraft: (draft: TransactionVoiceDraft) => void;
  categories?: string[];
}) {
  const session = useSessionSnapshot();
  const { requireAccount } = useAccountGate();
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  // Shrinks and fades the card away once a draft arrives, before the form takes its place.
  const leave = useRef(new Animated.Value(1)).current;
  const mounted = useRef(true);
  const [readiness, setReadiness] = useState<EntryReadiness>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const voiceLanguage = useVoiceLanguageStore((s) => s.language);

  const withToken = useCallback(
    async <Result,>(operation: (accessToken: string) => Promise<Result>): Promise<Result> => {
      try {
        return await operation(await session.getAccessToken(false));
      } catch (error) {
        if (error instanceof ApiTransportError && error.code === "session_expired") {
          return operation(await session.getAccessToken(true));
        }
        throw error;
      }
    },
    [session],
  );

  const guest = session.status === "guest";
  const loadReadiness = useCallback(async () => {
    // A guest has no Worker to ask. The button reads as ready and opens the sign-in prompt.
    if (guest) {
      setReadiness("ready");
      return;
    }
    setReadiness("checking");
    try {
      const preferences = await withToken((accessToken) => getReceiptPreferences({ accessToken }));
      if (!mounted.current) return;
      setReadiness(
        preferences.enabled &&
          preferences.consentedAt !== null &&
          preferences.consentVersion === CURRENT_RECEIPT_CONSENT_VERSION
          ? "ready"
          : "needs-consent",
      );
    } catch (error) {
      if (!mounted.current) return;
      setReadiness("unavailable");
      setMessage(
        error instanceof ApiTransportError
          ? error.message
          : "AI voice entry could not be checked. Try again shortly.",
      );
    }
  }, [guest, withToken]);

  useEffect(() => {
    mounted.current = true;
    void loadReadiness();
    return () => {
      mounted.current = false;
    };
  }, [loadReadiness]);

  const recorder = useVoiceRecorder<TransactionVoiceDraft>({
    getAccessToken: session.getAccessToken,
    language: voiceLanguage,
    transcribe: (token, recording) =>
      extractVoiceTransaction(token, recording, undefined, { categories, language: voiceLanguage }),
    liveTranscribeResult: async (transcript) => {
      const token = await session.getAccessToken(false);
      return extractVoiceTransactionFromTranscript(token, transcript, undefined, categories);
    },
    onPartialTranscript: (partial) => {
      setMessage(`Listening: “${partial}”`);
    },
    onTranscribed: (draft) => {
      if (reduceMotion) {
        onDraft(draft);
        return;
      }
      Animated.timing(leave, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => onDraft(draft));
    },
    onError: (error) => setMessage(error.message),
  });

  const acceptConsent = async (): Promise<void> => {
    if (consentBusy) return;
    setConsentBusy(true);
    try {
      await withToken((accessToken) => grantReceiptConsent({ accessToken }));
      if (!mounted.current) return;
      setReadiness("ready");
      setShowConsent(false);
      void recorder.startRecording();
    } catch (error) {
      if (!mounted.current) return;
      setMessage(
        error instanceof ApiTransportError
          ? error.message
          : "AI entry could not be enabled. Try again.",
      );
    } finally {
      if (mounted.current) setConsentBusy(false);
    }
  };

  const action = (): void => {
    if (disabled || recorder.phase === "transcribing") return;
    if (!requireAccount("voice")) return;
    setMessage(null);
    if (readiness === "needs-consent") {
      setShowConsent(true);
      return;
    }
    if (readiness !== "ready") {
      void loadReadiness();
      return;
    }
    if (recorder.phase === "recording") void recorder.stopAndTranscribe();
    else if (recorder.phase === "idle") void recorder.startRecording();
  };

  const recording = recorder.phase === "recording";
  const busy = recorder.phase === "requesting" || recorder.phase === "transcribing";
  const loading = readiness === "checking" || busy;
  // The mic speaks for itself when ready; the caption only shows a state worth reading.
  const idle = readiness === "ready" && recorder.phase === "idle";
  const label =
    readiness === "checking"
      ? "Checking voice entry…"
      : readiness === "unavailable"
        ? "Retry AI voice entry"
        : readiness === "needs-consent"
          ? "Enable AI voice entry"
          : recording
            ? "Stop and review"
            : recorder.phase === "requesting"
              ? "Starting microphone…"
              : recorder.phase === "transcribing"
                ? "Creating your draft…"
                : "Speak a transaction";
  const elapsedMinutes = Math.floor(recorder.elapsedSeconds / 60);
  const elapsedRemainder = String(recorder.elapsedSeconds % 60).padStart(2, "0");

  return (
    <>
      <Animated.View
        style={{
          opacity: leave,
          transform: [{ scale: leave.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
        }}
      >
        <Card style={styles.card}>
          <Text style={[typography.title, styles.center, { color: theme.colors.text }]}>
            {recording ? "Listening…" : "Tap the mic to start"}
          </Text>
          <View style={styles.micArea}>
            {recording ? <PulseRing color={theme.colors.danger} /> : null}
            <Pressable
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(disabled), busy: loading }}
              disabled={disabled || loading}
              onPress={action}
              style={[
                styles.mic,
                {
                  backgroundColor: recording ? theme.colors.danger : theme.colors.solid,
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onSolid} />
              ) : (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={recording ? "#ffffff" : theme.colors.onSolid}
                  name={recording ? "stop" : "microphone"}
                  size={40}
                />
              )}
            </Pressable>
          </View>
          {recording ? (
            <Text
              accessible
              accessibilityLabel={`Recording, ${elapsedMinutes} minutes ${recorder.elapsedSeconds % 60} seconds`}
              style={[styles.timer, styles.center, { color: theme.colors.danger }]}
            >
              {elapsedMinutes}:{elapsedRemainder}
            </Text>
          ) : idle ? null : (
            <Text style={[typography.label, styles.center, { color: theme.colors.textMuted }]}>
              {label}
            </Text>
          )}
          {recording ? (
            <Button
              accessibilityLabel="Cancel recording"
              onPress={() => {
                setMessage(null);
                void recorder.cancelRecording();
              }}
              variant="quiet"
            >
              Cancel
            </Button>
          ) : null}
          {message ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, styles.center, { color: theme.colors.textMuted }]}
            >
              {message}
            </Text>
          ) : null}
        </Card>
      </Animated.View>
      <ConfirmationDialog
        visible={showConsent}
        title="Enable AI-assisted entry?"
        message="Zoption sends only the voice recording, receipt photo, or PDF you choose to AI during that request to draft editable entries. These source files are not stored. You review every result before it is saved."
        confirmLabel={consentBusy ? "Enabling…" : "Accept and enable"}
        onCancel={() => setShowConsent(false)}
        onConfirm={() => void acceptConsent()}
      />
    </>
  );
}

/** A ring that swells and fades behind the mic while it records. */
function PulseRing({ color }: { color: ColorValue }) {
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion !== false) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          borderColor: color,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
        },
      ]}
    />
  );
}

const MIC_SIZE = 96;

const styles = StyleSheet.create({
  card: { gap: spacing.md, alignItems: "stretch", paddingVertical: spacing.xl },
  center: { textAlign: "center" },
  micArea: {
    alignSelf: "center",
    width: MIC_SIZE * 1.7,
    height: MIC_SIZE * 1.7,
    alignItems: "center",
    justifyContent: "center",
  },
  mic: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: radii.round,
    borderWidth: 3,
  },
  timer: {
    ...typography.headline,
    fontVariant: ["tabular-nums"],
  },
});
