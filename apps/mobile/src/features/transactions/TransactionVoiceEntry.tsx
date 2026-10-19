import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { CURRENT_RECEIPT_CONSENT_VERSION, type TransactionVoiceDraft } from "@zoption/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
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
import { elevation, radii, spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

type EntryReadiness = "checking" | "needs-consent" | "ready" | "unavailable";

/**
 * The voice hero as a layer over the transaction form. A draft fills the form underneath at
 * once, then the layer fades away to reveal it; "Type it instead" fades it without a draft.
 * `onClose` runs once the layer is gone, and the editor then unmounts it.
 */
export function TransactionVoiceEntry({
  disabled,
  onDraft,
  onClose,
  categories,
}: {
  disabled?: boolean;
  onDraft: (draft: TransactionVoiceDraft) => void;
  onClose: () => void;
  categories?: string[];
}) {
  const session = useSessionSnapshot();
  const { requireAccount } = useAccountGate();
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  // Fades the scrim and shrinks the card away, uncovering the form.
  const leave = useRef(new Animated.Value(1)).current;
  const leaving = useRef(false);
  const close = (): void => {
    if (leaving.current) return;
    leaving.current = true;
    if (reduceMotion) {
      onClose();
      return;
    }
    Animated.timing(leave, {
      toValue: 0,
      duration: 450,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(onClose);
  };
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
      onDraft(draft);
      close();
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

  // Tapping the mic floods the card with the solid color from the mic outward; it drains
  // back if recording is cancelled or fails.
  const active = recorder.phase !== "idle";
  const onCard = active ? theme.colors.onSolid : theme.colors.text;
  const fill = useRef(new Animated.Value(0)).current;
  const [micCenter, setMicCenter] = useState<number | null>(null);
  useEffect(() => {
    if (reduceMotion !== false) {
      fill.setValue(active ? 1 : 0);
      return;
    }
    Animated.timing(fill, {
      toValue: active ? 1 : 0,
      duration: active ? 1260 : 600,
      easing: active ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [active, reduceMotion, fill]);

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      statusBarTranslucent
      transparent
      visible
      onRequestClose={close}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay, opacity: leave }]}
      />
      <View style={styles.layer}>
        <Animated.View
          style={[
            styles.panel,
            {
              opacity: leave,
              transform: [
                { scale: leave.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
              ],
            },
          ]}
        >
          <Card style={[styles.card, elevation.dialog]}>
            {micCenter === null ? null : (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.fill,
                  {
                    top: micCenter - FILL_RADIUS,
                    backgroundColor: theme.colors.solid,
                    transform: [{ scale: fill }],
                  },
                ]}
              />
            )}
            <Text style={[typography.title, styles.center, { color: onCard }]}>
              {recording ? "Listening…" : active ? "One moment…" : "Tap the mic to start"}
            </Text>
            <View
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                setMicCenter(y + height / 2);
              }}
              style={styles.micArea}
            >
              <MicButton
                active={active}
                breathing={idle}
                disabled={Boolean(disabled)}
                label={label}
                loading={loading}
                recording={recording}
                onPress={action}
              />
            </View>
            {recording ? (
              <Text
                accessible
                accessibilityLabel={`Recording, ${elapsedMinutes} minutes ${recorder.elapsedSeconds % 60} seconds`}
                style={[styles.timer, styles.center, { color: onCard }]}
              >
                {elapsedMinutes}:{elapsedRemainder}
              </Text>
            ) : idle ? null : (
              <Text style={[typography.label, styles.center, { color: onCard }]}>{label}</Text>
            )}
            {recording ? (
              <Pressable
                accessibilityLabel="Cancel recording"
                accessibilityRole="button"
                onPress={() => {
                  setMessage(null);
                  void recorder.cancelRecording();
                }}
                style={styles.cancel}
              >
                <Text style={[typography.label, { color: onCard }]}>Cancel</Text>
              </Pressable>
            ) : active ? null : (
              <Button
                accessibilityLabel="Enter details manually"
                icon="pencil-outline"
                onPress={close}
                variant="quiet"
              >
                Type it instead
              </Button>
            )}
            {message ? (
              <Text
                accessibilityRole="alert"
                style={[
                  typography.caption,
                  styles.center,
                  { color: active ? theme.colors.onSolid : theme.colors.textMuted },
                ]}
              >
                {message}
              </Text>
            ) : null}
          </Card>
        </Animated.View>
      </View>
      <ConfirmationDialog
        visible={showConsent}
        title="Enable AI-assisted entry?"
        message="Zoption sends only the voice recording, receipt photo, or PDF you choose to AI during that request to draft editable entries. These source files are not stored. You review every result before it is saved."
        confirmLabel={consentBusy ? "Enabling…" : "Accept and enable"}
        onCancel={() => setShowConsent(false)}
        onConfirm={() => void acceptConsent()}
      />
    </Modal>
  );
}

/**
 * The mic. Ready and idle it breathes slowly to invite a tap; once the card turns solid it
 * flips to the light color, shows stop while recording with a ring pulsing out of it, and
 * a spinner while the draft is made.
 */
function MicButton({
  active,
  breathing,
  disabled,
  label,
  loading,
  recording,
  onPress,
}: {
  active: boolean;
  breathing: boolean;
  disabled: boolean;
  label: string;
  loading: boolean;
  recording: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const reduceMotion = useReduceMotion();
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    breath.setValue(0);
    if (!breathing || reduceMotion !== false) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathing, reduceMotion, breath]);

  const face = active ? theme.colors.onSolid : theme.colors.solid;
  const ink = active ? theme.colors.solid : theme.colors.onSolid;
  return (
    <>
      {recording ? <PulseRing color={theme.colors.onSolid} /> : null}
      <Animated.View
        style={{
          transform: [
            { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) },
          ],
        }}
      >
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ disabled, busy: loading }}
          disabled={disabled || loading}
          onPress={onPress}
          style={[styles.mic, { backgroundColor: face, opacity: disabled ? 0.55 : 1 }]}
        >
          {loading ? (
            <ActivityIndicator color={ink} />
          ) : (
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={ink}
              name={recording ? "stop" : "microphone"}
              size={40}
            />
          )}
        </Pressable>
      </Animated.View>
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
// Wide enough that the fill, centered on the mic, reaches every corner of the widest card.
const FILL_RADIUS = 640;

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: "center" },
  panel: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: spacing.md },
  card: { gap: spacing.md, alignItems: "stretch", paddingVertical: spacing.xl, overflow: "hidden" },
  fill: {
    position: "absolute",
    left: "50%",
    marginLeft: -FILL_RADIUS,
    width: FILL_RADIUS * 2,
    height: FILL_RADIUS * 2,
    borderRadius: FILL_RADIUS,
  },
  cancel: { alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
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
