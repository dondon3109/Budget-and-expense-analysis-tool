import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { promptsForGoal } from "@/features/primary-goal/goal-personalization";
import { useLeadGoal } from "@/stores/goal-profile-store";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

import { formatRecordingElapsed } from "./assistant-ui";
import type { RecordingPhase } from "./assistant-voice-hooks";
import { withTapSound } from "@/features/sounds/sound-effects";

const SUGGESTED_QUESTIONS = [
  "Where did my money go this month?",
  "Am I on budget this month?",
  "Which debt should I pay first?",
];

/** Empty-chat prompt with starter questions; tapping one fills the message box. */
export function AssistantEmptyChat({ onPick }: { onPick: (question: string) => void }) {
  const theme = useZoptionTheme();
  const goal = useLeadGoal();
  return (
    <View style={styles.suggestions}>
      <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
        Ask anything about your money
      </Text>
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        Tap a question to start, or type your own.
      </Text>
      {promptsForGoal(SUGGESTED_QUESTIONS, goal).map((question) => (
        <Pressable
          key={question}
          accessibilityRole="button"
          accessibilityLabel={question}
          onPress={withTapSound(() => onPick(question))}
          style={[
            styles.suggestion,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[typography.body, { color: theme.colors.text, flex: 1 }]}>{question}</Text>
          <MaterialCommunityIcons name="arrow-top-right" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

type VoiceStatusBannerProps =
  | { kind: "error"; message: string; onDismiss: () => void }
  | {
      kind: Exclude<RecordingPhase, "idle">;
      elapsedSeconds: number;
      liveUnavailable: boolean;
    };

/** One banner above the composer for recording, transcribing, mic permission, and voice errors. */
export function VoiceStatusBanner(props: VoiceStatusBannerProps) {
  const theme = useZoptionTheme();
  if (props.kind === "error") {
    return (
      <View
        accessibilityRole="alert"
        style={[
          styles.voiceStatus,
          { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger },
        ]}
      >
        <MaterialCommunityIcons name="microphone-off" size={20} color={theme.colors.danger} />
        <Text style={[typography.label, styles.voiceStatusText, { color: theme.colors.text }]}>
          {props.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={withTapSound(props.onDismiss)}
          hitSlop={12}
        >
          <MaterialCommunityIcons name="close" size={18} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    );
  }
  const recording = props.kind === "recording";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.voiceStatus,
        {
          backgroundColor: recording ? theme.colors.dangerSoft : theme.colors.surface,
          borderColor: recording ? theme.colors.danger : theme.colors.border,
        },
      ]}
    >
      {recording ? (
        <View style={[styles.recordingDot, { backgroundColor: theme.colors.danger }]} />
      ) : (
        <ActivityIndicator color={theme.colors.brand} size="small" />
      )}
      <View style={styles.voiceStatusText}>
        <Text style={[typography.label, { color: theme.colors.text }]}>
          {recording
            ? "Recording " + formatRecordingElapsed(props.elapsedSeconds)
            : props.kind === "transcribing"
              ? "Transcribing your question…"
              : "Allowing microphone access…"}
        </Text>
        {recording ? (
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            {props.liveUnavailable
              ? "No live preview. Your words appear when you stop."
              : "Tap the microphone to stop."}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions: { gap: spacing.sm, paddingTop: spacing.md },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touchTarget,
  },
  voiceStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  voiceStatusText: { flex: 1, gap: 2 },
  recordingDot: { width: 10, height: 10, borderRadius: radii.round },
});
