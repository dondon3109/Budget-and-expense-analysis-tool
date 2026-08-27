import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CURRENT_RECEIPT_CONSENT_VERSION, type TransactionVoiceDraft } from "@zoption/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { extractVoiceTransaction } from "@/api/ai-entry";
import { ApiTransportError } from "@/api/authenticated";
import { getReceiptPreferences, grantReceiptConsent } from "@/api/receipt-scan";
import { useSessionSnapshot } from "@/auth/session-state";
import { useVoiceRecorder } from "@/features/assistant/assistant-voice-hooks";
import { Button, Card, ConfirmationDialog } from "@/ui/components";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

type EntryReadiness = "checking" | "needs-consent" | "ready" | "unavailable";

export function TransactionVoiceEntry({
  disabled,
  onDraft,
}: {
  disabled?: boolean;
  onDraft: (draft: TransactionVoiceDraft) => void;
}) {
  const session = useSessionSnapshot();
  const theme = useZoptionTheme();
  const mounted = useRef(true);
  const [readiness, setReadiness] = useState<EntryReadiness>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);

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

  const loadReadiness = useCallback(async () => {
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
  }, [withToken]);

  useEffect(() => {
    mounted.current = true;
    void loadReadiness();
    return () => {
      mounted.current = false;
    };
  }, [loadReadiness]);

  const recorder = useVoiceRecorder({
    getAccessToken: session.getAccessToken,
    transcribe: extractVoiceTransaction,
    onPartialTranscript: (partial) => {
      setMessage(`Listening: “${partial}”`);
    },
    onTranscribed: (draft) => {
      onDraft(draft);
      setMessage(`Draft filled from: “${draft.transcript}”`);
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
      <Card style={styles.card}>
        <View className="flex-row items-start gap-3">
          <View
            style={[
              styles.icon,
              { backgroundColor: recording ? theme.colors.dangerSoft : theme.colors.brandSoft },
            ]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={recording ? theme.colors.danger : theme.colors.brand}
              name={recording ? "waveform" : "microphone-outline"}
              size={24}
            />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Say it, then inspect it
            </Text>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              Try “Spent 250 pesos on lunch today.” Nothing saves until you review this form.
            </Text>
          </View>
        </View>
        {recording ? (
          <View
            accessible
            accessibilityLabel={`Recording, ${elapsedMinutes} minutes ${recorder.elapsedSeconds % 60} seconds`}
            style={[
              styles.recordingStatus,
              {
                backgroundColor: theme.colors.dangerSoft,
                borderColor: theme.colors.danger,
              },
            ]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.danger}
              name="record-circle-outline"
              size={20}
            />
            <View className="min-w-0 flex-1">
              <Text style={[typography.label, { color: theme.colors.text }]}>Recording</Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                Speak naturally, then stop to review the draft.
              </Text>
            </View>
            <Text style={[styles.timer, { color: theme.colors.danger }]}>
              {elapsedMinutes}:{elapsedRemainder}
            </Text>
          </View>
        ) : null}
        <Button
          accessibilityLabel={label}
          disabled={disabled}
          icon={recording ? "stop" : "microphone-outline"}
          loading={loading}
          onPress={action}
          size="large"
          variant={recording ? "danger" : "primary"}
        >
          {label}
        </Button>
        {message ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.textMuted }]}
          >
            {message}
          </Text>
        ) : null}
      </Card>
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

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  icon: {
    alignItems: "center",
    borderRadius: radii.md,
    height: touchTarget,
    justifyContent: "center",
    width: touchTarget,
  },
  recordingStatus: {
    borderWidth: 1,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timer: {
    ...typography.headline,
    fontVariant: ["tabular-nums"],
  },
});
