import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantThread,
  type AssistantVoicePreferences,
} from "@zoption/shared";

import { createAssistantThreadTurn, sendAssistantTurn } from "@/api/assistant";
import { getAssistantVoicePreferences, grantAssistantVoiceConsent } from "@/api/assistant-voice";
import { ApiTransportError } from "@/api/authenticated";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { newClientRequestId } from "./assistant-forms";
import { useAssistantRecorder, useSpokenReplies } from "./assistant-voice-hooks";
import { CheckingRecordsIndicator } from "./CheckingRecordsIndicator";
import { renderMobileVoiceCaption } from "./render-voice-caption";
import { RadarWaveRings, ThinkingSphereCore } from "./ThinkingSphereIndicator";

/**
 * The only voice used by the voice conversation: Bright Female.
 * Same Fish Audio preset as web ("bright"); no picker is offered here.
 */
export const VOICE_CONVERSATION_SPEECH_VOICE = "bright" as const;

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

interface VoiceCaption {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface AssistantVoiceConversationProps {
  getAccessToken: (refresh: boolean) => Promise<string>;
  withToken: <T>(operation: (token: string) => Promise<T>) => Promise<T>;
  assistantName: string;
  onClose: () => void;
  onTurnComplete: (thread: AssistantThread) => void;
}

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: "Tap to speak",
  listening: "Listening…",
  thinking: "Checking your records…",
  speaking: "Speaking…",
};

export const VOICE_SUGGESTED_PROMPTS = [
  "How much did I spend this month?",
  "What is my biggest expense category?",
  "How are my budgets looking?",
  "Which debt should I pay first?",
] as const;

function newCaptionId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function AssistantVoiceConversation({
  getAccessToken,
  withToken,
  assistantName,
  onClose,
  onTurnComplete,
}: AssistantVoiceConversationProps) {
  const theme = useZoptionTheme();
  const listRef = useRef<FlatList<VoiceCaption>>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const threadIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const [preferences, setPreferences] = useState<AssistantVoicePreferences | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [livePartial, setLivePartial] = useState("");
  const [captions, setCaptions] = useState<VoiceCaption[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  // Typewriter caption: while the reply is spoken, letters appear paced to
  // the audio instead of the full text popping in before the voice starts.
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [typedCount, setTypedCount] = useState(0);

  const setVoiceStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let current = true;
    void withToken((token) => getAssistantVoicePreferences({ accessToken: token }))
      .then((data) => {
        if (current) setPreferences(data);
      })
      .catch((error: unknown) => {
        if (current) {
          setPrefsError(
            error instanceof ApiTransportError
              ? error.message
              : "Voice chat could not be prepared.",
          );
        }
      });
    return () => {
      current = false;
      mountedRef.current = false;
    };
  }, [withToken]);

  const consented = Boolean(
    preferences?.consentedAt &&
    preferences.consentVersion === CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  );
  const speechAvailable = preferences?.speechAvailable !== false;

  const enableVoice = useCallback(async () => {
    setEnabling(true);
    setNotice(null);
    try {
      // Consent first: the microphone is never requested before consent.
      const data = await withToken((token) => grantAssistantVoiceConsent({ accessToken: token }));
      if (mountedRef.current) setPreferences(data);
    } catch (error) {
      if (mountedRef.current) {
        setNotice(
          error instanceof ApiTransportError ? error.message : "Voice could not be enabled.",
        );
      }
    } finally {
      if (mountedRef.current) setEnabling(false);
    }
  }, [withToken]);

  const handleRecorderError = useCallback(
    (error: ApiTransportError) => {
      if (!mountedRef.current) return;
      setNotice(error.message);
      setVoiceStatus("idle");
    },
    [setVoiceStatus],
  );

  const handleSpeechError = useCallback(
    (error: ApiTransportError) => {
      if (!mountedRef.current) return;
      setAudioError(error.message);
      setSpeakingId(null);
      setVoiceStatus("idle");
    },
    [setVoiceStatus],
  );

  const spoken = useSpokenReplies({
    getAccessToken,
    onError: handleSpeechError,
    onEnded: () => {
      if (!mountedRef.current) return;
      setSpeakingId(null);
      setVoiceStatus("idle");
    },
  });
  const spokenRef = useRef(spoken);
  spokenRef.current = spoken;

  const typingFull =
    speakingId !== null
      ? (captions.find((item) => item.id === speakingId && item.role === "assistant")?.text ?? "")
      : "";

  // Advances the typewriter while the reply is spoken: held at the caret
  // until audio is actually audible, then paced to the playback position
  // (fixed fallback speed when the duration is unknown). Leaving `speaking`
  // snaps to the full text via the render below.
  const fallbackStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (status !== "speaking" || typingFull === "") return;
    const timer = setInterval(() => {
      const progress = spokenRef.current.speechProgress;
      // Known-but-not-playing means still loading: hold so text never outruns voice.
      if (progress && !progress.playing) return;
      let count: number;
      if (progress && progress.duration > 0) {
        count = Math.min(
          typingFull.length,
          Math.floor((progress.currentTime / progress.duration) * typingFull.length) + 1,
        );
      } else {
        if (fallbackStartRef.current === null) fallbackStartRef.current = Date.now();
        count = Math.min(
          typingFull.length,
          Math.floor((Date.now() - fallbackStartRef.current) / 60) + 1,
        );
      }
      setTypedCount((previous) => (count > previous ? count : previous));
      if (count >= typingFull.length) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, [status, speakingId, typingFull]);

  const handleFinalTranscript = useCallback(
    async (text: string) => {
      const finalText = text.trim();
      if (!finalText) {
        if (mountedRef.current) {
          setVoiceStatus("idle");
          setLivePartial("");
        }
        return;
      }
      if (statusRef.current === "thinking" || statusRef.current === "speaking") {
        return;
      }
      setLivePartial("");
      setNotice(null);
      setAudioError(null);
      setCaptions((current) => [...current, { id: newCaptionId(), role: "user", text: finalText }]);
      setVoiceStatus("thinking");
      try {
        const threadId = threadIdRef.current;
        const input = {
          message: finalText,
          clientRequestId: newClientRequestId(),
          kind: "voice" as const,
        };
        const turn = await withToken(async (token) => {
          if (threadId) {
            try {
              return await sendAssistantTurn({ accessToken: token }, threadId, input);
            } catch (turnError) {
              if (turnError instanceof ApiTransportError && turnError.status === 404) {
                threadIdRef.current = null;
                return await createAssistantThreadTurn({ accessToken: token }, input);
              }
              throw turnError;
            }
          }
          return await createAssistantThreadTurn({ accessToken: token }, input);
        });
        if (!mountedRef.current) return;
        threadIdRef.current = turn.thread.id;
        onTurnComplete(turn.thread);

        if (!speechAvailable) {
          setCaptions((current) => [
            ...current,
            { id: turn.assistantMessage.id, role: "assistant", text: turn.assistantMessage.content },
          ]);
          setNotice("Spoken replies are unavailable in this environment. Showing text only.");
          setVoiceStatus("idle");
          return;
        }

        // Enter speaking state with typedCount=0 BEFORE adding caption
        // so the assistant message renders directly into typewriter mode (at ▍)
        // rather than flashing the full text before speech begins.
        setSpeakingId(turn.assistantMessage.id);
        setTypedCount(0);
        fallbackStartRef.current = null;
        setVoiceStatus("speaking");
        setCaptions((current) => [
          ...current,
          { id: turn.assistantMessage.id, role: "assistant", text: turn.assistantMessage.content },
        ]);
        await spokenRef.current.listen(turn.assistantMessage.id, VOICE_CONVERSATION_SPEECH_VOICE);
      } catch (error) {
        if (!mountedRef.current) return;
        setNotice(
          error instanceof ApiTransportError ? error.message : "The voice turn failed. Try again.",
        );
        setVoiceStatus("idle");
      }
    },
    [onTurnComplete, setVoiceStatus, speechAvailable, withToken],
  );
  const transcriptRef = useRef(handleFinalTranscript);
  transcriptRef.current = handleFinalTranscript;

  const recorder = useAssistantRecorder({
    getAccessToken,
    onTranscribed: (text) => void transcriptRef.current(text),
    onError: handleRecorderError,
    onPartialTranscript: (partial) => {
      if (mountedRef.current) setLivePartial(partial);
    },
  });

  useEffect(() => {
    if (recorder.phase === "idle" && status === "listening") {
      setVoiceStatus("idle");
      setLivePartial("");
    }
  }, [recorder.phase, status, setVoiceStatus]);

  const handleOrbPress = useCallback(() => {
    if (!consented) {
      void enableVoice();
      return;
    }
    if (status === "listening" && recorder.phase === "recording") {
      void recorder.stopAndTranscribe();
    } else if (status === "speaking" && speakingId) {
      void spokenRef.current.listen(speakingId, VOICE_CONVERSATION_SPEECH_VOICE);
      setSpeakingId(null);
      setVoiceStatus("idle");
    } else {
      setNotice(null);
      setAudioError(null);
      setLivePartial("");
      setVoiceStatus("listening");
      void recorder.startRecording();
    }
  }, [consented, enableVoice, recorder, setVoiceStatus, speakingId, status]);

  const handleClose = useCallback(() => {
    if (statusRef.current === "listening") {
      void recorder.cancelRecording();
    }
    const playing = spokenRef.current.playingMessageId;
    if (playing !== null) {
      void spokenRef.current.listen(playing, VOICE_CONVERSATION_SPEECH_VOICE);
    }
    onClose();
  }, [onClose, recorder]);

  const handleResetSession = useCallback(() => {
    if (statusRef.current === "listening") {
      void recorder.cancelRecording();
    }
    const playing = spokenRef.current.playingMessageId;
    if (playing !== null) {
      void spokenRef.current.listen(playing, VOICE_CONVERSATION_SPEECH_VOICE);
    }
    setSpeakingId(null);
    setVoiceStatus("idle");
    setCaptions([]);
    setLivePartial("");
    setNotice(null);
    setAudioError(null);
    threadIdRef.current = null;
  }, [recorder, setVoiceStatus]);

  if (!preferences && prefsError === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.brand} />
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          Preparing voice chat…
        </Text>
      </View>
    );
  }

  if (prefsError !== null) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.danger }]}>
          {prefsError}
        </Text>
        <Text
          accessibilityRole="button"
          onPress={onClose}
          style={[typography.label, { color: theme.colors.brand }]}
        >
          Back to text chat
        </Text>
      </View>
    );
  }

  if (!consented) {
    return (
      <View style={[styles.consentContainer, { backgroundColor: theme.colors.canvas }]}>
        <View
          style={[
            styles.consentCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={[styles.consentIconBadge, { backgroundColor: theme.colors.brandSoft }]}>
            <MaterialCommunityIcons name="microphone" size={28} color={theme.colors.brand} />
          </View>
          <Text style={[typography.title, styles.consentTitle, { color: theme.colors.text }]}>
            Talk to {assistantName}?
          </Text>
          <Text style={[typography.body, styles.consentDesc, { color: theme.colors.textMuted }]}>
            Your recording is sent to Cloudflare Workers AI for transcription. After you finish
            speaking, the completed reply text is sent to Fish Audio for speech. Zoption does not
            store recordings or generated audio.
          </Text>

          <View style={styles.consentFeatures}>
            <View style={styles.consentFeatureRow}>
              <MaterialCommunityIcons name="creation" size={16} color={theme.colors.brand} />
              <Text
                style={[
                  typography.callout,
                  styles.consentFeatureText,
                  { color: theme.colors.text },
                ]}
              >
                Ask about budgets, expenses, transactions, goals, or debt
              </Text>
            </View>
            <View style={styles.consentFeatureRow}>
              <MaterialCommunityIcons name="volume-high" size={16} color={theme.colors.brand} />
              <Text
                style={[
                  typography.callout,
                  styles.consentFeatureText,
                  { color: theme.colors.text },
                ]}
              >
                Hear responses spoken aloud in real time
              </Text>
            </View>
          </View>

          {notice !== null ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: theme.colors.danger }]}
            >
              {notice}
            </Text>
          ) : null}

          <View style={styles.consentActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.consentSecondaryButton, { borderColor: theme.colors.border }]}
            >
              <Text style={[typography.label, { color: theme.colors.textMuted }]}>
                Not now
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: enabling }}
              onPress={() => void enableVoice()}
              style={[
                styles.consentPrimaryButton,
                { backgroundColor: theme.colors.brand },
                enabling && { opacity: 0.7 },
              ]}
            >
              <Text style={[typography.label, { color: theme.colors.onBrand }]}>
                {enabling ? "Enabling voice…" : "Accept and continue"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const orbScale =
    status === "idle" ? 1 : status === "listening" ? 1.08 : status === "speaking" ? 1.12 : 1.04;
  const orbOpacity = 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.canvas }]}>
      <View style={[styles.topbar, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.topbarSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to text chat"
            onPress={handleClose}
            style={[
              styles.iconButton,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
            ]}
            hitSlop={spacing.xs}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={theme.colors.text} />
          </Pressable>
        </View>

        <View style={styles.topbarCenter}>
          <View style={styles.topbarTitleRow}>
            <Text style={[typography.headline, styles.topbarTitle, { color: theme.colors.text }]}>
              Voice chat
            </Text>
            <View
              style={[
                styles.liveBadge,
                { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.border },
              ]}
            >
              <View style={[styles.liveDot, { backgroundColor: theme.colors.brand }]} />
              <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
                Live
              </Text>
            </View>
          </View>
          <Text
            numberOfLines={1}
            style={[typography.caption, styles.topbarSubtitle, { color: theme.colors.textMuted }]}
          >
            Hands-free conversation with {assistantName}
          </Text>
        </View>

        <View style={[styles.topbarSlot, styles.topbarSlotRight]}>
          {captions.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset conversation"
              onPress={handleResetSession}
              style={[
                styles.iconButton,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
              ]}
              hitSlop={spacing.xs}
            >
              <MaterialCommunityIcons name="refresh" size={20} color={theme.colors.text} />
            </Pressable>
          ) : (
            <View style={styles.topbarPlaceholder} />
          )}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={captions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.captions}
        accessibilityLabel="Conversation captions"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          livePartial || status !== "idle" ? null : (
            <View style={styles.emptyContainer}>
              <View
                style={[
                  styles.emptyIconBadge,
                  { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.border },
                ]}
              >
                <MaterialCommunityIcons name="waveform" size={30} color={theme.colors.brand} />
              </View>
              <Text style={[typography.headline, styles.emptyTitle, { color: theme.colors.text }]}>
                Ready to talk
              </Text>
              <Text
                style={[
                  typography.callout,
                  styles.emptySubtext,
                  { color: theme.colors.textMuted },
                ]}
              >
                Tap the microphone to speak, or tap a question below:
              </Text>
              <View style={styles.promptChipsContainer}>
                {VOICE_SUGGESTED_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    accessibilityRole="button"
                    accessibilityLabel={prompt}
                    onPress={() => void handleFinalTranscript(prompt)}
                    style={[
                      styles.promptChip,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="comment-text-outline"
                      size={15}
                      color={theme.colors.brand}
                    />
                    <Text
                      style={[
                        typography.callout,
                        styles.promptChipText,
                        { color: theme.colors.text },
                      ]}
                    >
                      “{prompt}”
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.caption,
              item.role === "user" ? styles.captionUser : styles.captionAssistant,
              item.role === "user"
                ? { backgroundColor: theme.colors.brand }
                : {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
            ]}
          >
            <View
              style={[
                styles.speakerBadge,
                item.role === "user" ? styles.speakerBadgeUser : styles.speakerBadgeAssistant,
                item.role === "assistant" && {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={item.role === "user" ? "account" : "creation"}
                size={12}
                color={item.role === "user" ? theme.colors.onBrand : theme.colors.brand}
              />
              <Text
                style={[
                  typography.caption,
                  styles.speakerBadgeText,
                  { color: item.role === "user" ? theme.colors.onBrand : theme.colors.textMuted },
                ]}
              >
                {item.role === "user" ? "You" : assistantName}
              </Text>
            </View>
            {item.role === "user" ? (
              <Text style={[typography.body, { color: theme.colors.onBrand }]}>
                {item.text}
              </Text>
            ) : (
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {item.id === speakingId && status === "speaking" && typedCount < typingFull.length
                  ? renderMobileVoiceCaption(
                      `${typingFull.slice(0, typedCount)}▍`,
                      [typography.body, { color: theme.colors.text }],
                      styles.boldCaption,
                    )
                  : renderMobileVoiceCaption(
                      item.text,
                      [typography.body, { color: theme.colors.text }],
                      styles.boldCaption,
                    )}
              </Text>
            )}
          </View>
        )}
        ListFooterComponent={
          status === "thinking" ? (
            <View
              style={[
                styles.caption,
                styles.captionAssistant,
                styles.thinkingBubble,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.speakerBadge,
                  styles.speakerBadgeAssistant,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <MaterialCommunityIcons name="creation" size={12} color={theme.colors.brand} />
                <Text
                  style={[
                    typography.caption,
                    styles.speakerBadgeText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {assistantName}
                </Text>
              </View>
              <CheckingRecordsIndicator size="medium" />
            </View>
          ) : null
        }
      />

      {(livePartial !== "" ||
        notice !== null ||
        audioError !== null ||
        (status === "listening" && recorder.liveStatus === "unavailable")) && (
        <View style={[styles.statusBlock, { borderTopColor: theme.colors.border }]}>
          {status === "listening" && recorder.liveStatus === "unavailable" && livePartial === "" ? (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Live preview is off here — your words appear when you stop.
            </Text>
          ) : null}
          {livePartial !== "" ? (
            <View
              style={[styles.caption, styles.captionUser, { backgroundColor: theme.colors.brand }]}
            >
              <View style={[styles.speakerBadge, styles.speakerBadgeUser]}>
                <View style={styles.liveDotSmall} />
                <Text
                  style={[
                    typography.caption,
                    styles.speakerBadgeText,
                    { color: theme.colors.onBrand },
                  ]}
                >
                  You · Live
                </Text>
              </View>
              <Text style={[typography.body, { color: theme.colors.onBrand }]}>
                “{livePartial}”
              </Text>
            </View>
          ) : null}
          {notice !== null ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: theme.colors.danger }]}
            >
              {notice}
            </Text>
          ) : null}
          {audioError !== null ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: theme.colors.danger }]}
            >
              {audioError}
            </Text>
          ) : null}
        </View>
      )}

      <View style={[styles.stage, { borderTopColor: theme.colors.border }]}>
        {/* Equalizer waveform visualizer */}
        <View style={styles.waveformContainer} accessibilityElementsHidden={true} aria-hidden={true}>
          <View
            style={[
              styles.waveBar,
              {
                backgroundColor:
                  status === "listening" || status === "speaking" || status === "thinking"
                    ? theme.colors.brand
                    : theme.colors.border,
                height:
                  status === "listening"
                    ? 14
                    : status === "speaking"
                      ? 12
                      : status === "thinking"
                        ? 10
                        : 5,
              },
            ]}
          />
          <View
            style={[
              styles.waveBar,
              {
                backgroundColor:
                  status === "listening" || status === "speaking" || status === "thinking"
                    ? theme.colors.brand
                    : theme.colors.border,
                height:
                  status === "listening"
                    ? 24
                    : status === "speaking"
                      ? 18
                      : status === "thinking"
                        ? 18
                        : 5,
              },
            ]}
          />
          <View
            style={[
              styles.waveBar,
              {
                backgroundColor:
                  status === "listening" || status === "speaking" || status === "thinking"
                    ? theme.colors.brand
                    : theme.colors.border,
                height:
                  status === "listening"
                    ? 32
                    : status === "speaking"
                      ? 24
                      : status === "thinking"
                        ? 26
                        : 5,
              },
            ]}
          />
          <View
            style={[
              styles.waveBar,
              {
                backgroundColor:
                  status === "listening" || status === "speaking" || status === "thinking"
                    ? theme.colors.brand
                    : theme.colors.border,
                height:
                  status === "listening"
                    ? 24
                    : status === "speaking"
                      ? 18
                      : status === "thinking"
                        ? 18
                        : 5,
              },
            ]}
          />
          <View
            style={[
              styles.waveBar,
              {
                backgroundColor:
                  status === "listening" || status === "speaking" || status === "thinking"
                    ? theme.colors.brand
                    : theme.colors.border,
                height:
                  status === "listening"
                    ? 14
                    : status === "speaking"
                      ? 12
                      : status === "thinking"
                        ? 10
                        : 5,
              },
            ]}
          />
        </View>

        <View style={styles.orbWrapper}>
          {status === "thinking" ? (
            <RadarWaveRings color={theme.colors.brand} size={104} />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              status === "listening"
                ? "Stop listening"
                : status === "thinking"
                  ? "Assistant is thinking"
                  : status === "speaking"
                    ? "Stop speaking"
                    : "Start talking"
            }
            accessibilityHint={
              status === "idle"
                ? "Starts the microphone"
                : status === "speaking"
                  ? "Stops audio playback"
                  : undefined
            }
            disabled={status === "thinking"}
            onPress={handleOrbPress}
            style={[
              styles.orb,
              {
                backgroundColor: theme.colors.brand,
                borderColor: theme.colors.brand,
                opacity: orbOpacity,
                transform: [{ scale: orbScale }],
              },
            ]}
          >
            {status === "thinking" ? (
              <ThinkingSphereCore color={theme.colors.onBrand} />
            ) : (
              <MaterialCommunityIcons
                name={
                  status === "listening"
                    ? "stop"
                    : status === "speaking"
                      ? "volume-high"
                      : "microphone"
                }
                size={40}
                color={theme.colors.onBrand}
              />
            )}
          </Pressable>
        </View>
        <Text style={[typography.label, { color: theme.colors.text }]}>{STATUS_LABEL[status]}</Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {status === "idle" && "Tap to speak with your assistant"}
          {status === "listening" && "Tap button when done"}
          {status === "thinking" && "Looking up financial records…"}
          {status === "speaking" && "Tap orb to interrupt playback"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  consentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  consentCard: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
  },
  consentIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  consentTitle: {
    textAlign: "center",
  },
  consentDesc: {
    textAlign: "center",
    lineHeight: 22,
  },
  consentFeatures: {
    width: "100%",
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  consentFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  consentFeatureText: {
    flex: 1,
  },
  consentActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.md,
    marginTop: spacing.sm,
    width: "100%",
  },
  consentSecondaryButton: {
    minHeight: 44,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  consentPrimaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topbarSlot: {
    width: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  topbarSlotRight: {
    alignItems: "flex-end",
  },
  topbarPlaceholder: {
    width: 40,
    height: 40,
  },
  topbarCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  topbarTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  topbarTitle: {
    textAlign: "center",
  },
  topbarSubtitle: {
    textAlign: "center",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  captions: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  emptyIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    textAlign: "center",
  },
  emptySubtext: {
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  promptChipsContainer: {
    width: "100%",
    maxWidth: 400,
    gap: spacing.xs,
  },
  promptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  promptChipText: {
    flex: 1,
  },
  caption: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 4,
  },
  captionUser: {
    alignSelf: "flex-end",
    maxWidth: "85%",
  },
  captionAssistant: {
    alignSelf: "flex-start",
    maxWidth: "90%",
    borderWidth: StyleSheet.hairlineWidth,
  },
  speakerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radii.round,
    alignSelf: "flex-start",
    marginBottom: 2,
  },
  speakerBadgeUser: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  speakerBadgeAssistant: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  speakerBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },
  thinkingBubble: {
    gap: spacing.xs,
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusBlock: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stage: {
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 36,
    marginBottom: spacing.xs,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  orbWrapper: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  orb: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  boldCaption: {
    fontWeight: "700",
  },
});
