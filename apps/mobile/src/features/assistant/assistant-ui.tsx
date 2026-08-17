import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { AssistantMemory } from "@zoption/shared";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { FormField } from "@/ui/components/FormField";
import { SelectionField, type SelectionOption } from "@/ui/components/SelectionField";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

import type { RecordingPhase } from "./assistant-voice-hooks";

import { formatThreadTime, validateIdentityName } from "./assistant-forms";

export function AssistantConsentCard({
  retentionDays,
  accepting,
  onAccept,
}: {
  retentionDays: number;
  accepting: boolean;
  onAccept: () => void;
}) {
  const theme = useZoptionTheme();
  const points = [
    "Read-only by design — the assistant can analyze your records but never edits them.",
    "Your credentials and sessions stay private; only your question and the financial data needed to answer it are sent to the AI provider.",
    "Audit snapshots of what the assistant read are sanitized and kept only for review.",
    "Operational monitoring is metadata-only — never your transaction descriptions.",
    "Assistant memory carries across chats and can be cleared anytime.",
  ];
  return (
    <Card>
      <View className="gap-4">
        <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
          Your data, your boundaries.
        </Text>
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          The AI Financial Assistant answers questions using your own records. Before it can help,
          confirm how your data is handled.
        </Text>
        <View className="gap-2">
          {points.map((point) => (
            <View key={point} className="flex-row gap-2">
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={18}
                color={theme.colors.brand}
              />
              <Text style={[typography.body, { color: theme.colors.text, flex: 1 }]}>{point}</Text>
            </View>
          ))}
        </View>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Assistant conversations, audit snapshots and memory are retained for up to {retentionDays}{" "}
          days. Educational budgeting information only — not personalized investment, tax or
          insurance advice.
        </Text>
        <Button loading={accepting} onPress={onAccept}>
          Accept and continue
        </Button>
      </View>
    </Card>
  );
}

export function AssistantIdentityCard({
  assistantName,
  userPreferredName,
  saving,
  onSave,
}: {
  assistantName: string;
  userPreferredName: string;
  saving: boolean;
  onSave: (assistantName: string, userPreferredName: string) => void;
}) {
  const theme = useZoptionTheme();
  const [assistant, setAssistant] = useState(assistantName);
  const [preferred, setPreferred] = useState(userPreferredName);
  const assistantError = useMemo(() => validateIdentityName(assistant), [assistant]);
  const preferredError = useMemo(() => validateIdentityName(preferred), [preferred]);
  const canSave = assistantError === null && preferredError === null && !saving;
  return (
    <Card>
      <View className="gap-4">
        <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
          Meet your assistant
        </Text>
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          Choose a name for your assistant and tell it what to call you. Both stay between you and
          your workspace.
        </Text>
        <FormField
          label="Your assistant's name"
          value={assistant}
          error={assistantError ?? undefined}
          placeholder="e.g. Zoe"
          maxLength={80}
          autoCapitalize="words"
          onChangeText={setAssistant}
        />
        <FormField
          label="What should your assistant call you?"
          value={preferred}
          error={preferredError ?? undefined}
          placeholder="e.g. Don"
          maxLength={80}
          autoCapitalize="words"
          onChangeText={setPreferred}
        />
        <Button
          loading={saving}
          disabled={!canSave}
          onPress={() => onSave(assistant.trim(), preferred.trim())}
        >
          Save and continue
        </Button>
      </View>
    </Card>
  );
}

export function AssistantMessageBubble({
  role,
  content,
  status,
  createdAt,
  evidenceLabel,
  listening,
  onListen,
}: {
  role: "user" | "assistant";
  content: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  evidenceLabel?: string;
  listening?: boolean;
  onListen?: () => void;
}) {
  const theme = useZoptionTheme();
  const isUser = role === "user";
  return (
    <View className={isUser ? "items-end" : "items-start"}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? theme.colors.brand : theme.colors.surfaceRaised,
            borderColor: isUser ? theme.colors.brand : theme.colors.border,
          },
        ]}
      >
        <Text
          style={[typography.body, { color: isUser ? theme.colors.onBrand : theme.colors.text }]}
        >
          {content}
        </Text>
      </View>
      <View className="mt-1 flex-row items-center gap-2">
        {status === "failed" ? (
          <Text style={[typography.caption, { color: theme.colors.danger }]}>
            Not sent. Try asking again.
          </Text>
        ) : null}
        {!isUser && status === "completed" && evidenceLabel ? (
          <View className="flex-row items-center gap-1">
            <MaterialCommunityIcons
              name="file-document-check-outline"
              size={12}
              color={theme.colors.textMuted}
            />
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {evidenceLabel}
            </Text>
          </View>
        ) : null}
        {!isUser && status === "completed" && onListen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={listening ? "Stop spoken reply" : "Play spoken reply"}
            onPress={onListen}
            style={styles.listen}
          >
            <MaterialCommunityIcons
              name={listening ? "stop-circle-outline" : "volume-high"}
              size={16}
              color={theme.colors.brand}
            />
          </Pressable>
        ) : null}
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {formatThreadTime(createdAt)}
        </Text>
      </View>
    </View>
  );
}

export function AssistantThreadRow({
  title,
  lastMessageAt,
  onOpen,
  onDelete,
}: {
  title: string;
  lastMessageAt: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={"Conversation " + title + ", " + formatThreadTime(lastMessageAt)}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.threadRow,
        {
          backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View className="flex-1 gap-1">
        <Text numberOfLines={2} style={[typography.body, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {formatThreadTime(lastMessageAt)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={"Delete conversation " + title}
        onPress={onDelete}
        hitSlop={8}
        style={styles.deleteButton}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

export function AssistantUpgradeBanner({
  message,
  onReviewPlan,
  onDismiss,
}: {
  message: string;
  onReviewPlan: () => void;
  onDismiss: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.warningSoft,
          borderColor: theme.colors.warning,
        },
      ]}
    >
      <View className="flex-row items-start gap-2">
        <MaterialCommunityIcons name="lock-outline" size={18} color={theme.colors.warning} />
        <View className="flex-1 gap-2">
          <Text style={[typography.body, { color: theme.colors.text }]}>{message}</Text>
          <View className="flex-row gap-2">
            <Button variant="secondary" onPress={onReviewPlan}>
              Review Plan
            </Button>
            <Button variant="quiet" onPress={onDismiss}>
              Dismiss
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}

export function MemoryPreferencesBlock({
  memory,
  debtStrategy,
  responseDetail,
  coachingStyle,
  savingMemory,
  onDebtStrategy,
  onClearMemory,
}: {
  memory: AssistantMemory[];
  debtStrategy: "avalanche" | "snowball" | null;
  responseDetail: string;
  coachingStyle: string;
  savingMemory: boolean;
  onDebtStrategy: (strategy: "avalanche" | "snowball" | null) => void;
  onClearMemory: () => void;
}) {
  const theme = useZoptionTheme();
  const facts = memory.filter((item) => item.kind !== "summary");
  const debtOptions: SelectionOption[] = [
    { id: "avalanche", label: "Avalanche", detail: "Highest interest first" },
    { id: "snowball", label: "Snowball", detail: "Smallest balance first" },
    { id: "none", label: "No preference", detail: "Let the assistant infer it" },
  ];
  return (
    <View className="gap-3">
      <SelectionField
        label="Debt payoff preference"
        value={debtStrategy ?? "none"}
        options={debtOptions}
        placeholder="No preference"
        sheetTitle="Debt payoff preference"
        disabled={savingMemory}
        onSelect={(value) =>
          onDebtStrategy(value === "none" ? null : (value as "avalanche" | "snowball"))
        }
      />
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Response style: {responseDetail === "concise" ? "concise detail" : "standard detail"} ·{" "}
        {coachingStyle === "gentle" ? "gentle coaching" : "direct coaching"}
      </Text>
      {facts.length > 0 ? (
        <View className="gap-2">
          <Text style={[typography.label, { color: theme.colors.text }]}>Remembered facts</Text>
          {facts.map((item) => (
            <View key={item.id} style={[styles.factRow, { borderColor: theme.colors.border }]}>
              <Text style={[typography.body, { color: theme.colors.text }]}>{item.value}</Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {item.source === "user_stated" ? "You shared this" : "Learned from context"}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Nothing remembered yet. The assistant only keeps short-term memory across chats.
        </Text>
      )}
      {facts.length > 0 ? (
        <Button variant="danger" loading={savingMemory} onPress={onClearMemory}>
          Clear memory
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: "86%",
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listen: { padding: 2 },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  deleteButton: { padding: 4 },
  banner: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  factRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: 2,
  },
  recordButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});

export function formatRecordingElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return minutes + ":" + String(remainder).padStart(2, "0");
}

interface VoiceRecordButtonProps {
  phase: RecordingPhase;
  onPress: () => void;
}

/**
 * Composer microphone control with three visually distinct states: idle shows
 * the microphone, recording keeps the microphone on a danger background, and
 * the loading states (permission request and transcription) show a spinner on
 * the brand background. Recording never looks like loading.
 */
export function VoiceRecordButton({ phase, onPress }: VoiceRecordButtonProps) {
  const theme = useZoptionTheme();
  const recording = phase === "recording";
  const loading = phase === "requesting" || phase === "transcribing";
  const label = recording
    ? "Stop and transcribe"
    : phase === "transcribing"
      ? "Transcribing your question"
      : phase === "requesting"
        ? "Allowing microphone access"
        : "Record voice question";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      onPress={onPress}
      style={[
        styles.recordButton,
        { backgroundColor: recording ? theme.colors.danger : theme.colors.brand },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.onBrand} size="small" />
      ) : (
        <MaterialCommunityIcons name="microphone-outline" size={22} color={theme.colors.onBrand} />
      )}
    </Pressable>
  );
}
