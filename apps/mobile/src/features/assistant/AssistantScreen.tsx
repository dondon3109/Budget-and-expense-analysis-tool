import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import type {
  AssistantMemory,
  AssistantPreferences,
  AssistantVoicePreferences,
} from "@zoption/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ApiTransportError,
  clearAssistantMemory,
  createAssistantThreadTurn,
  deleteAllAssistantThreads,
  deleteAssistantThread,
  getAssistantMemory,
  getAssistantMemoryPreferences,
  getAssistantPreferences,
  listAssistantMessages,
  listAssistantThreads,
  sendAssistantTurn,
  updateAssistantMemoryPreferences,
  updateAssistantPreferences,
  type AssistantWireMessage,
} from "@/api/assistant";
import {
  getAssistantVoicePreferences,
  grantAssistantVoiceConsent,
  type AssistantSpeechVoice,
} from "@/api/assistant-voice";
import { useSessionSnapshot } from "@/auth/session-state";
import { useAssistantVoiceOptionsStore } from "@/stores/assistant-voice-store";
import {
  BottomSheet,
  Button,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  FormField,
  SelectionField,
  SkeletonLines,
} from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import {
  MAX_ASSISTANT_MESSAGE_LENGTH,
  newClientRequestId,
  requiresAssistantConsent,
  requiresIdentitySetup,
  validateAssistantMessage,
} from "./assistant-forms";
import {
  AssistantConsentCard,
  AssistantIdentityCard,
  AssistantMessageBubble,
  AssistantThreadRow,
  AssistantUpgradeBanner,
  formatRecordingElapsed,
  MemoryPreferencesBlock,
  VoiceRecordButton,
} from "./assistant-ui";
import { useAssistantRecorder, useSpokenReplies } from "./assistant-voice-hooks";

type AssistantView = "threads" | "chat";

interface VoiceError {
  message: string;
}

export function AssistantScreen() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const voiceOptions = useAssistantVoiceOptionsStore();

  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AssistantPreferences | null>(null);
  const [voicePreferences, setVoicePreferences] = useState<AssistantVoicePreferences | null>(null);

  const [view, setView] = useState<AssistantView>("threads");
  const [threads, setThreads] = useState<
    { id: string; title: string; lastMessageAt: string; createdAt: string }[]
  >([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantWireMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [limitBanner, setLimitBanner] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<VoiceError | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [identityName, setIdentityName] = useState("");
  const [identityPreferred, setIdentityPreferred] = useState("");
  const [memory, setMemory] = useState<AssistantMemory[]>([]);
  const [memoryPreferences, setMemoryPreferences] = useState<{
    debtStrategy: "avalanche" | "snowball" | null;
    responseDetail: "concise" | "standard";
    coachingStyle: "gentle" | "direct";
  } | null>(null);
  const [confirmClearChats, setConfirmClearChats] = useState(false);
  const [pendingDeleteThread, setPendingDeleteThread] = useState<string | null>(null);

  const listRef = useRef<FlatList<AssistantWireMessage>>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Harmless, user-scoped UI preferences are reset when the identity changes so
  // one account never inherits another account's assistant options.
  useEffect(() => {
    voiceOptions.ensureSubject(session.subject);
  }, [session.subject, voiceOptions]);

  const withToken = useCallback(
    async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
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

  const loadPreferences = useCallback(async () => {
    setPhase("loading");
    setFatalError(null);
    try {
      const [prefs, voicePrefs] = await withToken(async (token) => {
        const [a, b] = await Promise.all([
          getAssistantPreferences({ accessToken: token }),
          getAssistantVoicePreferences({ accessToken: token }).catch((error) => {
            // Voice is optional; a disabled or unconfigured voice surface must
            // not block the text assistant.
            if (error instanceof ApiTransportError && error.code === "not_found") return null;
            throw error;
          }),
        ]);
        return [a, b] as const;
      });
      if (!mounted.current) return;
      setPreferences(prefs);
      setVoicePreferences(voicePrefs);
      setPhase("ready");
    } catch (error) {
      if (!mounted.current) return;
      setPhase("error");
      setFatalError(
        error instanceof ApiTransportError
          ? error.message
          : "The assistant could not be reached. Try again.",
      );
    }
  }, [withToken]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const loadThreads = useCallback(async () => {
    try {
      const page = await withToken((token) => listAssistantThreads({ accessToken: token }));
      if (!mounted.current) return;
      setThreads(page.items);
    } catch (error) {
      setInlineError(
        error instanceof ApiTransportError ? error.message : "Conversations could not be loaded.",
      );
    }
  }, [withToken]);

  useEffect(() => {
    if (phase === "ready" && !requiresAssistantConsent(preferences)) {
      void loadThreads();
    }
  }, [phase, preferences, loadThreads]);

  const openThread = useCallback(
    async (threadId: string) => {
      setActiveThreadId(threadId);
      setMessages([]);
      setLoadingMessages(true);
      setLimitBanner(null);
      setInlineError(null);
      try {
        const page = await withToken((token) =>
          listAssistantMessages({ accessToken: token }, threadId),
        );
        if (!mounted.current) return;
        setMessages(page.items);
      } catch (error) {
        setInlineError(
          error instanceof ApiTransportError ? error.message : "Messages could not be loaded.",
        );
      } finally {
        if (mounted.current) setLoadingMessages(false);
      }
    },
    [withToken],
  );

  const startNewChat = useCallback(() => {
    setActiveThreadId(null);
    setMessages([]);
    setLimitBanner(null);
    setInlineError(null);
    setView("chat");
  }, []);

  const handleSend = useCallback(
    async (text?: string) => {
      const message = (text ?? draft).trim();
      const validation = validateAssistantMessage(message);
      if (validation !== null) {
        setInlineError(validation);
        return;
      }
      if (sending) return;
      setSending(true);
      setInlineError(null);
      setLimitBanner(null);
      setVoiceError(null);
      const clientRequestId = newClientRequestId();
      try {
        const turn = await withToken((token) =>
          activeThreadId === null
            ? createAssistantThreadTurn({ accessToken: token }, { message, clientRequestId })
            : sendAssistantTurn({ accessToken: token }, activeThreadId, {
                message,
                clientRequestId,
              }),
        );
        if (!mounted.current) return;
        setActiveThreadId(turn.thread.id);
        setMessages((previous) => [
          ...previous.filter(
            (item) => item.id !== turn.userMessage.id && item.id !== turn.assistantMessage.id,
          ),
          turn.userMessage,
          turn.assistantMessage,
        ]);
        setDraft("");
        setView("chat");
        setThreads((previous) => [
          turn.thread,
          ...previous.filter((item) => item.id !== turn.thread.id),
        ]);
        void loadThreads();
        // When spoken replies are requested, play the new answer automatically.
        if (
          voicePreferences?.enabled === true &&
          voicePreferences.speechAvailable &&
          voiceOptions.replyMode === "voice"
        ) {
          void spokenReplies.listen(turn.assistantMessage.id, voiceOptions.voice);
        }
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      } catch (error) {
        if (!mounted.current) return;
        if (error instanceof ApiTransportError && error.code === "plan_limit") {
          setLimitBanner(error.message);
        } else {
          setInlineError(
            error instanceof ApiTransportError ? error.message : "The question could not be sent.",
          );
        }
      } finally {
        if (mounted.current) setSending(false);
      }
    },
    [
      activeThreadId,
      draft,
      sending,
      voiceOptions.replyMode,
      voiceOptions.voice,
      voicePreferences,
      withToken,
    ],
  );

  const handleVoiceError = useCallback((error: ApiTransportError) => {
    setVoiceError({ message: error.message });
  }, []);

  const recorder = useAssistantRecorder({
    getAccessToken: session.getAccessToken,
    onTranscribed: (text) => {
      const canAutoSend = voiceOptions.autoSend && voicePreferences?.reviewRequired !== true;
      if (canAutoSend) {
        void handleSend(text);
      } else {
        setDraft((previous) => (previous ? previous + " " + text : text));
      }
    },
    onError: handleVoiceError,
  });

  const spokenReplies = useSpokenReplies({
    getAccessToken: session.getAccessToken,
    onError: handleVoiceError,
  });

  const acceptConsent = useCallback(async () => {
    setBusyAction("consent");
    try {
      const updated = await withToken((token) =>
        updateAssistantPreferences({ accessToken: token }, { consented: true }),
      );
      if (!mounted.current) return;
      setPreferences(updated);
    } catch (error) {
      setInlineError(
        error instanceof ApiTransportError ? error.message : "Consent could not be recorded.",
      );
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  }, [withToken]);

  const saveIdentity = useCallback(
    async (assistantName: string, userPreferredName: string) => {
      setBusyAction("identity");
      try {
        const updated = await withToken((token) =>
          updateAssistantPreferences({ accessToken: token }, { assistantName, userPreferredName }),
        );
        if (!mounted.current) return;
        setPreferences(updated);
      } catch (error) {
        setInlineError(
          error instanceof ApiTransportError ? error.message : "Preferences could not be saved.",
        );
      } finally {
        if (mounted.current) setBusyAction(null);
      }
    },
    [withToken],
  );

  const saveStylePreferences = useCallback(
    async (
      update: { responseDetail: "concise" | "standard" } | { coachingStyle: "gentle" | "direct" },
    ) => {
      // The server updates detail and style as one preference record.
      const fullUpdate = {
        responseDetail: preferences?.responseDetail ?? "concise",
        coachingStyle: preferences?.coachingStyle ?? "gentle",
        ...update,
      };
      setBusyAction("style");
      try {
        const updated = await withToken((token) =>
          updateAssistantPreferences({ accessToken: token }, fullUpdate),
        );
        if (!mounted.current) return;
        setPreferences(updated);
        setMemoryPreferences((previous) =>
          previous === null ? previous : { ...previous, ...update },
        );
      } catch (error) {
        setInlineError(
          error instanceof ApiTransportError ? error.message : "Style could not be saved.",
        );
      } finally {
        if (mounted.current) setBusyAction(null);
      }
    },
    [withToken],
  );

  const loadMemory = useCallback(async () => {
    try {
      const [items, preferencesResult] = await withToken(async (token) =>
        Promise.all([
          getAssistantMemory({ accessToken: token }),
          getAssistantMemoryPreferences({ accessToken: token }),
        ]),
      );
      if (!mounted.current) return;
      setMemory(items);
      setMemoryPreferences(preferencesResult);
    } catch (error) {
      setInlineError(
        error instanceof ApiTransportError ? error.message : "Memory could not be loaded.",
      );
    }
  }, [withToken]);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    if (preferences) {
      setIdentityName(preferences.assistantName ?? "");
      setIdentityPreferred(preferences.userPreferredName ?? "");
    }
    void loadMemory();
  }, [loadMemory, preferences]);

  const saveDebtStrategy = useCallback(
    async (debtStrategy: "avalanche" | "snowball" | null) => {
      setBusyAction("memory");
      try {
        const updated = await withToken((token) =>
          updateAssistantMemoryPreferences({ accessToken: token }, { debtStrategy }),
        );
        if (!mounted.current) return;
        setMemoryPreferences(updated);
      } catch (error) {
        setInlineError(
          error instanceof ApiTransportError ? error.message : "Preference could not be saved.",
        );
      } finally {
        if (mounted.current) setBusyAction(null);
      }
    },
    [withToken],
  );

  const confirmClearMemory = useCallback(async () => {
    setBusyAction("memory");
    try {
      await withToken((token) => clearAssistantMemory({ accessToken: token }));
      if (!mounted.current) return;
      setMemory([]);
    } catch (error) {
      setInlineError(
        error instanceof ApiTransportError ? error.message : "Memory could not be cleared.",
      );
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  }, [withToken]);

  const confirmDeleteThread = useCallback(async () => {
    if (!pendingDeleteThread) return;
    const threadId = pendingDeleteThread;
    setPendingDeleteThread(null);
    setBusyAction("threads");
    try {
      await withToken((token) => deleteAssistantThread({ accessToken: token }, threadId));
      if (!mounted.current) return;
      setThreads((previous) => previous.filter((item) => item.id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
        setView("threads");
      }
    } catch (error) {
      setInlineError(
        error instanceof ApiTransportError
          ? error.message
          : "The conversation could not be deleted.",
      );
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  }, [activeThreadId, pendingDeleteThread, withToken]);

  const confirmClearAllChats = useCallback(async () => {
    setConfirmClearChats(false);
    setBusyAction("threads");
    try {
      await withToken((token) => deleteAllAssistantThreads({ accessToken: token }));
      if (!mounted.current) return;
      setThreads([]);
      setActiveThreadId(null);
      setMessages([]);
      setView("threads");
    } catch (error) {
      setInlineError(
        error instanceof ApiTransportError ? error.message : "Conversations could not be cleared.",
      );
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  }, [withToken]);

  const enableVoice = useCallback(async () => {
    setBusyAction("voice");
    try {
      const updated = await withToken((token) =>
        grantAssistantVoiceConsent({ accessToken: token }),
      );
      if (!mounted.current) return;
      setVoicePreferences(updated);
    } catch (error) {
      setVoiceError({
        message:
          error instanceof ApiTransportError ? error.message : "Voice mode could not be enabled.",
      });
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  }, [withToken]);

  const draftValid = validateAssistantMessage(draft) === null;
  const showConsent = preferences !== null && requiresAssistantConsent(preferences);
  const showIdentity =
    preferences !== null &&
    !requiresAssistantConsent(preferences) &&
    requiresIdentitySetup(preferences);

  const settingsAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Assistant settings"
      onPress={openSettings}
      style={styles.iconButton}
    >
      <MaterialCommunityIcons name="cog-outline" size={22} color={theme.colors.text} />
    </Pressable>
  );

  if (phase === "loading") {
    return (
      <Screen title="AI Assistant" description="Grounded in your recorded finances">
        <SkeletonLines lines={5} />
      </Screen>
    );
  }

  if (phase === "error") {
    return (
      <Screen title="AI Assistant">
        <ErrorState
          title="The assistant is unavailable"
          message={fatalError ?? "Zoption could not be reached."}
          onRetry={() => void loadPreferences()}
        />
      </Screen>
    );
  }

  if (showConsent || showIdentity) {
    return (
      <Screen title="AI Assistant" description="Read-only and grounded in your records" scroll>
        {showConsent ? (
          <AssistantConsentCard
            retentionDays={preferences?.retentionDays ?? 90}
            accepting={busyAction === "consent"}
            onAccept={() => void acceptConsent()}
          />
        ) : (
          <AssistantIdentityCard
            assistantName={preferences?.assistantName ?? ""}
            userPreferredName={preferences?.userPreferredName ?? ""}
            saving={busyAction === "identity"}
            onSave={(assistant, preferred) => void saveIdentity(assistant, preferred)}
          />
        )}
        {inlineError ? (
          <Text style={[typography.caption, { color: theme.colors.danger }]}>{inlineError}</Text>
        ) : null}
      </Screen>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <View style={styles.header}>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {view === "chat" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to conversations"
                onPress={() => {
                  setView("threads");
                  setActiveThreadId(null);
                  setMessages([]);
                }}
                hitSlop={8}
              >
                <MaterialCommunityIcons name="arrow-left" size={22} color={theme.colors.text} />
              </Pressable>
            ) : null}
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[typography.display, styles.headerTitle, { color: theme.colors.text }]}
            >
              {view === "chat" ? "New conversation" : "AI Assistant"}
            </Text>
          </View>
          {view === "threads" ? (
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              Read-only answers grounded in your records
            </Text>
          ) : null}
        </View>
        {settingsAction}
      </View>

      {inlineError && view === "threads" ? (
        <Text
          style={[
            typography.caption,
            { color: theme.colors.danger, paddingHorizontal: spacing.md },
          ]}
        >
          {inlineError}
        </Text>
      ) : null}

      {limitBanner ? (
        <View style={styles.bannerWrap}>
          <AssistantUpgradeBanner
            message={limitBanner}
            onReviewPlan={() => router.push("/(app)/plan-billing")}
            onDismiss={() => setLimitBanner(null)}
          />
        </View>
      ) : null}

      {view === "threads" ? (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <AssistantThreadRow
              title={item.title}
              lastMessageAt={item.lastMessageAt}
              onOpen={() => {
                setView("chat");
                void openThread(item.id);
              }}
              onDelete={() => setPendingDeleteThread(item.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListHeaderComponent={
            <View style={styles.newChat}>
              <Button onPress={startNewChat}>New conversation</Button>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title="No conversations yet"
              description="Ask about your spending, budgets, subscriptions, goals or debts. The assistant reads your records and never changes them."
            />
          }
        />
      ) : (
        <View style={styles.chat}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatContent}
            renderItem={({ item }) => (
              <AssistantMessageBubble
                role={item.role}
                content={item.content}
                status={item.status}
                createdAt={item.createdAt}
                evidenceLabel={evidenceLabelFor(item)}
                listening={spokenReplies.playingMessageId === item.id}
                onListen={
                  item.role === "assistant" &&
                  item.status === "completed" &&
                  voicePreferences?.enabled === true &&
                  voicePreferences.speechAvailable
                    ? () => void spokenReplies.listen(item.id, voiceOptions.voice)
                    : undefined
                }
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            ListEmptyComponent={
              loadingMessages ? (
                <ActivityIndicator color={theme.colors.brand} />
              ) : (
                <EmptyState
                  title="Ask anything about your money"
                  description="Where did my salary go? Am I on budget this month? Which debt should I pay first?"
                />
              )
            }
            ListFooterComponent={
              sending ? (
                <View style={styles.thinking}>
                  <ActivityIndicator color={theme.colors.brand} />
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                    Checking your records…
                  </Text>
                </View>
              ) : null
            }
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
          {voiceError ? (
            <View style={styles.voiceErrorWrap}>
              <Text style={[typography.caption, { color: theme.colors.danger }]}>
                {voiceError.message}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                onPress={() => setVoiceError(null)}
                hitSlop={8}
              >
                <MaterialCommunityIcons name="close" size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
          {recorder.phase !== "idle" ? (
            <View style={styles.voiceStatusWrap}>
              <Text
                style={[
                  typography.caption,
                  {
                    color:
                      recorder.phase === "recording" ? theme.colors.danger : theme.colors.textMuted,
                  },
                ]}
              >
                {recorder.phase === "recording"
                  ? "Recording… " +
                    formatRecordingElapsed(recorder.elapsedSeconds) +
                    " — tap the microphone to stop."
                  : recorder.phase === "transcribing"
                    ? "Transcribing your question…"
                    : "Allowing microphone access…"}
              </Text>
            </View>
          ) : null}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 92 : 0}
          >
            <View
              style={[
                styles.composer,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              {voicePreferences?.enabled === true && voicePreferences.consentedAt !== null ? (
                <VoiceRecordButton
                  phase={recorder.phase}
                  onPress={() => {
                    if (recorder.phase === "recording") void recorder.stopAndTranscribe();
                    else if (recorder.phase === "idle") void recorder.startRecording();
                  }}
                />
              ) : null}
              <TextInput
                accessibilityLabel="Message the assistant"
                multiline
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  voicePreferences?.enabled === true && voiceOptions.autoSend
                    ? "Ask, or tap the microphone"
                    : "Ask about your finances"
                }
                placeholderTextColor={theme.colors.textMuted}
                maxLength={MAX_ASSISTANT_MESSAGE_LENGTH + 200}
                style={[styles.input, { color: theme.colors.text }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !draftValid || sending }}
                disabled={!draftValid || sending}
                onPress={() => void handleSend()}
                style={[
                  styles.sendButton,
                  {
                    backgroundColor:
                      draftValid && !sending ? theme.colors.brand : theme.colors.border,
                  },
                ]}
              >
                {sending ? (
                  <ActivityIndicator color={theme.colors.onBrand} size="small" />
                ) : (
                  <MaterialCommunityIcons name="arrow-up" size={22} color={theme.colors.onBrand} />
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      <BottomSheet
        visible={settingsOpen}
        title="Assistant settings"
        onDismiss={() => setSettingsOpen(false)}
      >
        <View className="gap-4 pb-4">
          <Text style={[typography.label, { color: theme.colors.text }]}>Identity</Text>
          <FormField
            label="Assistant name"
            value={identityName}
            onChangeText={setIdentityName}
            placeholder="e.g. Zoe"
            maxLength={80}
          />
          <FormField
            label="Your name"
            value={identityPreferred}
            onChangeText={setIdentityPreferred}
            placeholder="e.g. Don"
            maxLength={80}
          />
          <Button
            variant="secondary"
            loading={busyAction === "identity"}
            disabled={
              identityName.trim().length === 0 ||
              identityPreferred.trim().length === 0 ||
              (identityName.trim() === preferences?.assistantName &&
                identityPreferred.trim() === preferences?.userPreferredName)
            }
            onPress={() => void saveIdentity(identityName, identityPreferred)}
          >
            Save identity
          </Button>

          <Text style={[typography.label, { color: theme.colors.text }]}>Answers</Text>
          <SelectionField
            label="Response detail"
            value={preferences?.responseDetail ?? "concise"}
            options={[
              { id: "concise", label: "Concise", detail: "Short conclusion and next step" },
              { id: "standard", label: "Standard", detail: "More context and assumptions" },
            ]}
            placeholder="Concise"
            sheetTitle="Response detail"
            disabled={busyAction === "style"}
            onSelect={(value) =>
              void saveStylePreferences({ responseDetail: value as "concise" | "standard" })
            }
          />
          <SelectionField
            label="Coaching style"
            value={preferences?.coachingStyle ?? "gentle"}
            options={[
              { id: "gentle", label: "Gentle", detail: "Supportive and reassuring" },
              { id: "direct", label: "Direct", detail: "Plain and action-focused" },
            ]}
            placeholder="Gentle"
            sheetTitle="Coaching style"
            disabled={busyAction === "style"}
            onSelect={(value) =>
              void saveStylePreferences({ coachingStyle: value as "gentle" | "direct" })
            }
          />

          <Text style={[typography.label, { color: theme.colors.text }]}>Voice</Text>
          {voicePreferences?.enabled !== true || voicePreferences.consentedAt === null ? (
            <VoiceConsentBlock busy={busyAction === "voice"} onEnable={() => void enableVoice()} />
          ) : (
            <View className="gap-3">
              <SelectionField
                label="Replies"
                value={voiceOptions.replyMode}
                options={[
                  { id: "text", label: "Text only" },
                  {
                    id: "voice",
                    label: "Spoken replies",
                    detail: "Generated speech with each answer",
                  },
                ]}
                placeholder="Text only"
                sheetTitle="Reply mode"
                disabled={!voicePreferences.speechAvailable}
                onSelect={(value) => voiceOptions.setReplyMode(value as "text" | "voice")}
              />
              {!voicePreferences.speechAvailable ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  Spoken replies are unavailable in this environment.
                </Text>
              ) : null}
              <SelectionField
                label="Voice"
                value={voiceOptions.voice}
                options={[
                  { id: "default", label: "Default" },
                  { id: "bright", label: "Bright" },
                  { id: "energetic", label: "Energetic" },
                ]}
                placeholder="Default"
                sheetTitle="Assistant voice"
                onSelect={(value) => voiceOptions.setVoice(value as AssistantSpeechVoice)}
              />
              <SelectionField
                label="Voice input"
                value={voiceOptions.autoSend ? "auto" : "review"}
                options={[
                  { id: "auto", label: "Send automatically" },
                  { id: "review", label: "Review before sending" },
                ]}
                placeholder="Send automatically"
                sheetTitle="Voice input"
                disabled={voicePreferences.reviewRequired}
                hint={
                  voicePreferences.reviewRequired
                    ? "Transcriptions are reviewed here before sending in this environment."
                    : undefined
                }
                onSelect={(value) => voiceOptions.setAutoSend(value === "auto")}
              />
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                Recordings are transcribed by Cloudflare Workers AI and spoken replies are generated
                by Fish Audio. Zoption does not store your recordings or the generated audio.
              </Text>
            </View>
          )}

          <Text style={[typography.label, { color: theme.colors.text }]}>Memory</Text>
          {memoryPreferences ? (
            <MemoryPreferencesBlock
              memory={memory}
              debtStrategy={memoryPreferences.debtStrategy}
              responseDetail={memoryPreferences.responseDetail}
              coachingStyle={memoryPreferences.coachingStyle}
              savingMemory={busyAction === "memory"}
              onDebtStrategy={(strategy) => void saveDebtStrategy(strategy)}
              onClearMemory={() => void confirmClearMemory()}
            />
          ) : (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Loading memory…
            </Text>
          )}

          <Text style={[typography.label, { color: theme.colors.text }]}>Conversations</Text>
          <Button
            variant="danger"
            loading={busyAction === "threads"}
            disabled={threads.length === 0}
            onPress={() => setConfirmClearChats(true)}
          >
            Clear all conversations
          </Button>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Conversations, audit snapshots and assistant memory are retained for up to{" "}
            {preferences?.retentionDays ?? 90} days.
          </Text>
        </View>
      </BottomSheet>

      <ConfirmationDialog
        visible={pendingDeleteThread !== null}
        title="Delete conversation?"
        message="This conversation is removed for good. Your financial records are never touched."
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDeleteThread(null)}
        onConfirm={() => void confirmDeleteThread()}
      />
      <ConfirmationDialog
        visible={confirmClearChats}
        title="Clear all conversations?"
        message="Every assistant conversation is removed. Your financial records are never touched."
        confirmLabel="Clear all"
        destructive
        onCancel={() => setConfirmClearChats(false)}
        onConfirm={() => void confirmClearAllChats()}
      />
    </SafeAreaView>
  );
}

function VoiceConsentBlock({ busy, onEnable }: { busy: boolean; onEnable: () => void }) {
  const theme = useZoptionTheme();
  return (
    <View className="gap-3">
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        Enable voice mode to ask questions aloud and hear spoken replies. Your recording is sent to
        Cloudflare Workers AI for transcription; generated speech is provided by Fish Audio. Zoption
        does not store recordings or generated audio.
      </Text>
      <Button variant="secondary" loading={busy} onPress={onEnable}>
        Enable voice mode
      </Button>
    </View>
  );
}

function evidenceLabelFor(message: AssistantWireMessage): string | undefined {
  const metadata = message.metadata as
    { sources?: Array<{ label?: unknown; period?: { label?: unknown } }> } | undefined;
  const sources = Array.isArray(metadata?.sources) ? metadata.sources : [];
  const first = sources[0];
  if (!first || typeof first.label !== "string") return undefined;
  const period = typeof first.period?.label === "string" ? " · " + first.period.label : "";
  return "Grounded in " + first.label + period;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  iconButton: { padding: spacing.xs },
  headerTitle: { flexShrink: 1 },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl },
  newChat: { marginBottom: spacing.md, alignSelf: "stretch" },
  chat: { flex: 1 },
  chatContent: { padding: spacing.md, paddingBottom: spacing.md },
  bannerWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    margin: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    padding: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    maxHeight: 120,
    fontSize: 16,
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    paddingHorizontal: 4,
  },
  voiceStatusWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  sendButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  voiceErrorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
});
