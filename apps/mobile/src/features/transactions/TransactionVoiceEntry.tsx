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
import { withTapSound } from "@/features/sounds/sound-effects";
import { useVoiceLanguageStore } from "@/stores/voice-language-store";
import { Card, ConfirmationDialog } from "@/ui/components";
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
            {/* Two equal fixed regions hold the mic in the middle and keep the card one size
                in every state, so it never jumps on a tap. */}
            <View style={styles.region}>
              <Text style={[typography.title, styles.center, { color: onCard }]}>
                {recording ? "Listening…" : active ? "One moment…" : "Tap the mic to start"}
              </Text>
              <View style={styles.status}>
                {recording ? (
                  <Text
                    accessible
                    accessibilityLabel={`Recording, ${elapsedMinutes} minutes ${recorder.elapsedSeconds % 60} seconds`}
                    style={[styles.timer, styles.center, { color: onCard }]}
                  >
                    {elapsedMinutes}:{elapsedRemainder} · Tap to finish
                  </Text>
                ) : idle ? null : (
                  <Text style={[typography.label, styles.center, { color: onCard }]}>{label}</Text>
                )}
              </View>
            </View>
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
            <View style={styles.region}>
              <View style={styles.message}>
                {message ? (
                  <Text
                    accessibilityRole="alert"
                    numberOfLines={2}
                    style={[
                      typography.caption,
                      styles.center,
                      { color: active ? theme.colors.onSolid : theme.colors.textMuted },
                    ]}
                  >
                    {message}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
          {/* One quiet action under the card: type instead while idle, cancel while recording.
              It is hidden rather than removed while a draft is made, so the card never shifts. */}
          <View
            pointerEvents={active && !recording ? "none" : "auto"}
            style={[styles.outside, { opacity: active && !recording ? 0 : 1 }]}
          >
            {recording ? (
              <Pressable
                accessibilityLabel="Cancel recording"
                accessibilityRole="button"
                hitSlop={spacing.sm}
                onPress={withTapSound(() => {
                  setMessage(null);
                  void recorder.cancelRecording();
                })}
                style={styles.outsideAction}
              >
                <MaterialCommunityIcons color={ON_SCRIM} name="close" size={18} />
                <Text style={[typography.label, { color: ON_SCRIM }]}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityElementsHidden={active}
                accessibilityLabel="Enter details manually"
                accessibilityRole="button"
                hitSlop={spacing.sm}
                onPress={withTapSound(close)}
                style={styles.outsideAction}
              >
                <MaterialCommunityIcons color={ON_SCRIM} name="pencil-outline" size={18} />
                <Text style={[typography.label, { color: ON_SCRIM }]}>Type it instead</Text>
              </Pressable>
            )}
          </View>
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
 * The mic. Ready and idle it breathes slowly to invite a tap. Once the card turns solid the
 * circle gives way to light sound bars that bounce while it records (a tap stops it), then
 * to a spinner while the draft is made.
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

  return (
    <Animated.View
      style={{
        transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }],
      }}
    >
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: loading }}
        disabled={disabled || loading}
        onPress={withTapSound(onPress)}
        style={[
          styles.mic,
          {
            backgroundColor: active ? "transparent" : theme.colors.solid,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.onSolid} size="large" />
        ) : recording ? (
          <SoundBars color={theme.colors.onSolid} />
        ) : (
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.onSolid}
            name="microphone"
            size={32}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

// Each bar's swing time; uneven so the bars never fall into step.
const BAR_DURATIONS = [420, 560, 380, 620, 480];

/** Bars that rise and fall out of step, like a level meter, while the mic records. */
function SoundBars({ color }: { color: ColorValue }) {
  const reduceMotion = useReduceMotion();
  const levels = useRef(BAR_DURATIONS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduceMotion !== false) return;
    const loops = levels.map((level, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(level, {
            toValue: 1,
            duration: BAR_DURATIONS[index],
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(level, {
            toValue: 0,
            duration: BAR_DURATIONS[index],
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [reduceMotion, levels]);
  return (
    <View accessibilityElementsHidden style={styles.bars}>
      {levels.map((level, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              backgroundColor: color,
              transform: [
                { scaleY: level.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const MIC_SIZE = 76;
// The scrim is dark in every theme, so text set straight on it is white.
const ON_SCRIM = "#ffffff";
// Wide enough that the fill, centered on the mic, reaches every corner of the card.
const FILL_RADIUS = 360;

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: "center" },
  panel: { width: "100%", maxWidth: 320, alignSelf: "center", paddingHorizontal: spacing.lg },
  card: { gap: spacing.sm, alignItems: "stretch", paddingVertical: spacing.lg, overflow: "hidden" },
  fill: {
    position: "absolute",
    left: "50%",
    marginLeft: -FILL_RADIUS,
    width: FILL_RADIUS * 2,
    height: FILL_RADIUS * 2,
    borderRadius: FILL_RADIUS,
  },
  region: {
    height: typography.title.lineHeight + spacing.sm + typography.headline.lineHeight,
    justifyContent: "center",
    gap: spacing.sm,
  },
  status: { height: typography.headline.lineHeight, justifyContent: "center" },
  message: { height: typography.caption.lineHeight * 2, justifyContent: "center" },
  outside: { alignItems: "center", marginTop: spacing.lg },
  outsideAction: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  center: { textAlign: "center" },
  micArea: {
    alignSelf: "center",
    width: MIC_SIZE * 1.6,
    height: MIC_SIZE * 1.6,
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
  bars: { flexDirection: "row", alignItems: "center", gap: 6, height: MIC_SIZE * 0.7 },
  bar: { width: 8, height: "100%", borderRadius: radii.round },
  timer: {
    ...typography.headline,
    fontVariant: ["tabular-nums"],
  },
});
