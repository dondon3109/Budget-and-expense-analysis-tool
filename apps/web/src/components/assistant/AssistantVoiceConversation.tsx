import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantTurnResult,
  type AssistantVoicePreferences,
} from "@zoption/shared";
import { LoaderCircle, Mic, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  createAssistantThread,
  getAssistantVoiceSpeech,
  getAssistantVoicePreferences,
  grantAssistantVoiceConsent,
  sendAssistantMessage,
  transcribeAssistantVoice,
} from "../../lib/api";
import {
  startLiveTranscriptionSession,
  type LiveTranscriptionSession,
} from "../../lib/voiceStream";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { prepareAssistantTurn } from "./prepareAssistantTurn";
import { renderVoiceCaptionContent } from "./renderVoiceCaption";
import "./AssistantVoiceConversation.css";

/**
 * The only voice used by the voice conversation: Bright Female.
 * Reference preset ca3007f96ae7499ab87d27ea3599956a in
 * apps/api/src/assistant/fish-audio.ts. No picker is offered here.
 */
export const VOICE_CONVERSATION_SPEECH_VOICE = "bright" as const;

const MAX_RECORDING_MS = 60_000;
const NO_SPEECH_TIMEOUT_MS = 7_000;
const ENDING_SILENCE_MS = 1_400;
const VOICE_SAMPLE_INTERVAL_MS = 100;
const SPEECH_RMS_THRESHOLD = 0.025;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";
type StopReason = "manual" | "silence" | "no-speech" | "limit" | "cancelled";

interface Caption {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface AssistantVoiceConversationProps {
  workspace: AuthenticatedWorkspace;
  assistantName: string;
  onClose: () => void;
  onTurnComplete: (result: AssistantTurnResult) => void;
}

function requestId(): string {
  return crypto.randomUUID();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "The voice conversation could not continue.";
}

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: "Tap the ball and speak",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export function AssistantVoiceConversation({
  workspace,
  assistantName,
  onClose,
  onTurnComplete,
}: AssistantVoiceConversationProps) {
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const activityTimerRef = useRef<number | undefined>(undefined);
  const elapsedTimerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const liveSessionRef = useRef<LiveTranscriptionSession | null>(null);
  const liveSessionPromiseRef = useRef<Promise<LiveTranscriptionSession> | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const heardSpeechRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const liveTranscriptRef = useRef<string>("");
  const liveErrorRef = useRef<string | null>(null);
  const liveShouldStopRef = useRef(false);
  const stopReasonRef = useRef<StopReason>("manual");
  const mountedRef = useRef(true);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | undefined>(undefined);
  const threadIdRef = useRef<string | null>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const captionsEndRef = useRef<HTMLDivElement | null>(null);

  const [preferences, setPreferences] = useState<AssistantVoicePreferences>();
  const [prefsError, setPrefsError] = useState<string>();
  const [enabling, setEnabling] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [livePartial, setLivePartial] = useState("");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [notice, setNotice] = useState<string>();
  const [audioError, setAudioError] = useState<string>();
  // Typewriter caption: while the reply is spoken, letters appear paced to
  // the audio instead of the full text popping in before the voice starts.
  const [speakingId, setSpeakingId] = useState<string>();
  const [typedCount, setTypedCount] = useState(0);

  function setVoiceStatus(next: VoiceStatus) {
    statusRef.current = next;
    setStatus(next);
  }

  function clearTimersAndAudioContext() {
    window.clearTimeout(stopTimerRef.current);
    window.clearInterval(activityTimerRef.current);
    activityTimerRef.current = undefined;
    window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = undefined;
    const audioContext = audioContextRef.current;
    audioContextRef.current = undefined;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
  }

  function clearRecordingResources() {
    window.clearTimeout(stopTimerRef.current);
    window.clearInterval(activityTimerRef.current);
    activityTimerRef.current = undefined;
    window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = undefined;
    if (liveSessionRef.current) {
      void liveSessionRef.current.stop().catch(() => {});
      liveSessionRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch {}
      speechRecognitionRef.current = null;
    }
    liveSessionPromiseRef.current = null;
    liveShouldStopRef.current = false;
    liveErrorRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = undefined;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
  }

  function stopPlayback() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = undefined;
  }

  useEffect(() => {
    mountedRef.current = true;
    let current = true;
    void getAssistantVoicePreferences(workspace)
      .then((data) => {
        if (current) setPreferences(data);
      })
      .catch((error) => {
        if (current) setPrefsError(errorMessage(error));
      });
    return () => {
      current = false;
      mountedRef.current = false;
      clearRecordingResources();
      stopReasonRef.current = "cancelled";
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopPlayback();
    };
  }, [workspace.key]);

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [captions, livePartial, status]);

  const typingFull =
    speakingId !== undefined
      ? (captions.find((item) => item.id === speakingId && item.role === "assistant")?.text ?? "")
      : "";

  // Advances the typewriter while the reply is spoken: held at the caret
  // until audio is actually audible, then paced to the playback position
  // (fixed fallback speed when the duration is unknown). Leaving `speaking`
  // snaps to the full text in the render below.
  const fallbackStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (status !== "speaking" || typingFull === "") return;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      // Audio not playing or paused: hold at current count so text never outruns voice.
      if (!audio || audio.paused || audio.ended) return;
      const duration = audio.duration;
      let count: number;
      if (Number.isFinite(duration) && duration > 0) {
        count = Math.min(
          typingFull.length,
          Math.floor((audio.currentTime / duration) * typingFull.length) + 1,
        );
      } else {
        if (fallbackStartRef.current === null) fallbackStartRef.current = Date.now();
        count = Math.min(
          typingFull.length,
          Math.floor((Date.now() - fallbackStartRef.current) / 60) + 1,
        );
      }
      setTypedCount((previous) => (count > previous ? count : previous));
      if (count >= typingFull.length) window.clearInterval(timer);
    }, 40);
    return () => window.clearInterval(timer);
  }, [status, speakingId, typingFull]);

  const consented = Boolean(
    preferences?.consentedAt &&
    preferences.consentVersion === CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  );
  const speechAvailable = preferences?.speechAvailable !== false;
  const busy = status === "listening" || status === "thinking" || status === "speaking";

  async function enableVoice() {
    if (enabling) return;
    setEnabling(true);
    setNotice(undefined);
    try {
      // Consent first: the microphone is never requested before consent.
      const data = await grantAssistantVoiceConsent(workspace);
      if (mountedRef.current) setPreferences(data);
    } catch (error) {
      if (mountedRef.current) setNotice(errorMessage(error));
    } finally {
      if (mountedRef.current) setEnabling(false);
    }
  }

  async function handleFinalTranscript(text: string) {
    const finalText = text.trim();
    if (!finalText || statusRef.current === "thinking" || statusRef.current === "speaking") return;
    setLivePartial("");
    setNotice(undefined);
    setAudioError(undefined);
    setCaptions((current) => [...current, { id: requestId(), role: "user", text: finalText }]);
    setVoiceStatus("thinking");
    try {
      const threadId = threadIdRef.current;
      const input = { message: finalText, clientRequestId: requestId() };
      const prepared = await prepareAssistantTurn({
        send: () =>
          threadId
            ? sendAssistantMessage(workspace, { threadId, input })
            : createAssistantThread(workspace, { ...input, kind: "voice" }),
        replyMode: "spoken",
        speechVoice: VOICE_CONVERSATION_SPEECH_VOICE,
        // When speech is unavailable the completed text is shown with a
        // notice instead; synthesis is never attempted.
        voiceEnabled: speechAvailable,
        getSpeech: (assistantMessageId, voice) =>
          getAssistantVoiceSpeech(workspace, assistantMessageId, voice),
      });
      if (!mountedRef.current) return;
      threadIdRef.current = prepared.result.thread.id;
      onTurnComplete(prepared.result);

      if (!speechAvailable) {
        setCaptions((current) => [
          ...current,
          {
            id: prepared.result.assistantMessage.id,
            role: "assistant",
            text: prepared.result.assistantMessage.content,
          },
        ]);
        setNotice("Spoken replies are unavailable in this environment. Showing text only.");
        setVoiceStatus("idle");
        return;
      }

      const voiceAudio = prepared.voice && !prepared.voice.error ? prepared.voice.audio : undefined;
      if (!voiceAudio) {
        setCaptions((current) => [
          ...current,
          {
            id: prepared.result.assistantMessage.id,
            role: "assistant",
            text: prepared.result.assistantMessage.content,
          },
        ]);
        setAudioError(
          prepared.voice?.error ??
            "The spoken reply could not be prepared. You can still read the answer above.",
        );
        setVoiceStatus("idle");
        return;
      }

      const audioUrl = URL.createObjectURL(voiceAudio);
      audioUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Enter speaking mode with typedCount=0 BEFORE adding caption to state
      // so the message renders directly into typewriter mode at the caret (▍),
      // preventing the full text from appearing before the voice starts.
      setSpeakingId(prepared.result.assistantMessage.id);
      setTypedCount(0);
      fallbackStartRef.current = null;
      setVoiceStatus("speaking");
      setCaptions((current) => [
        ...current,
        {
          id: prepared.result.assistantMessage.id,
          role: "assistant",
          text: prepared.result.assistantMessage.content,
        },
      ]);

      audio.onended = () => {
        if (!mountedRef.current) return;
        stopPlayback();
        setSpeakingId(undefined);
        setVoiceStatus("idle");
      };
      audio.onerror = () => {
        if (!mountedRef.current) return;
        stopPlayback();
        setSpeakingId(undefined);
        setAudioError("The spoken reply could not be played. You can still read the answer above.");
        setVoiceStatus("idle");
      };
      await audio.play().catch(() => {
        if (!mountedRef.current) return;
        stopPlayback();
        setSpeakingId(undefined);
        setAudioError("The spoken reply could not be played. You can still read the answer above.");
        setVoiceStatus("idle");
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setNotice(errorMessage(error));
      setVoiceStatus("idle");
    }
  }

  async function transcribeFallback(blob: Blob) {
    try {
      const result = await transcribeAssistantVoice(workspace, blob);
      if (!mountedRef.current) return;
      await handleFinalTranscript(result.text);
    } catch (error) {
      if (!mountedRef.current) return;
      setNotice(errorMessage(error));
      setVoiceStatus("idle");
    }
  }

  async function monitorVoiceActivity(stream: MediaStream) {
    if (typeof AudioContext === "undefined") return;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    if (audioContext.state === "suspended") await audioContext.resume();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.15;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = Date.now();
    heardSpeechRef.current = false;
    lastSpeechAtRef.current = startedAt;
    let noiseFloor: number | null = null;

    activityTimerRef.current = window.setInterval(() => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") return;

      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const now = Date.now();
      const elapsed = now - startedAt;

      // Adaptively calibrate noise floor during the first 500ms
      if (elapsed < 500) {
        noiseFloor = noiseFloor === null ? rms : Math.min(noiseFloor, rms);
      }

      const dynamicThreshold =
        noiseFloor === null
          ? SPEECH_RMS_THRESHOLD
          : Math.min(0.06, Math.max(0.018, noiseFloor * 2.2));

      if (rms >= dynamicThreshold) {
        heardSpeechRef.current = true;
        lastSpeechAtRef.current = now;
        return;
      }
      if (heardSpeechRef.current && now - lastSpeechAtRef.current >= ENDING_SILENCE_MS) {
        stopRecording("silence");
      } else if (!heardSpeechRef.current && elapsed >= NO_SPEECH_TIMEOUT_MS) {
        stopRecording("no-speech");
      }
    }, VOICE_SAMPLE_INTERVAL_MS);
  }

  function requestMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Voice recording is not supported in this browser.");
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }

  async function startRecording(providedStream?: MediaStream) {
    let stream = providedStream;
    try {
      setNotice(undefined);
      setAudioError(undefined);
      stream ??= await requestMicrophone();
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const activeStream = stream;
      streamRef.current = activeStream;
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        void (async () => {
          const liveSessionAtStop = liveSessionRef.current;
          const livePromiseAtStop = liveSessionPromiseRef.current;

          let liveFinalization: Promise<void> | null = null;
          if (liveSessionAtStop) {
            liveSessionRef.current = null;
            liveSessionPromiseRef.current = null;
            liveFinalization = liveSessionAtStop.stop().catch(() => {});
          } else if (livePromiseAtStop) {
            liveSessionPromiseRef.current = null;
            liveFinalization = livePromiseAtStop
              .then((session) => session.stop().catch(() => {}))
              .catch((error) => {
                if (error instanceof Error) liveErrorRef.current = error.message;
              });
          }

          if (liveFinalization) {
            window.clearTimeout(stopTimerRef.current);
            window.clearInterval(activityTimerRef.current);
            activityTimerRef.current = undefined;
            window.clearInterval(elapsedTimerRef.current);
            elapsedTimerRef.current = undefined;
            const monitoringContext = audioContextRef.current;
            audioContextRef.current = undefined;
            if (monitoringContext && monitoringContext.state !== "closed")
              void monitoringContext.close();
            try {
              await liveFinalization;
            } catch {
              // Ignore live stream errors during finalization shutdown
            }
          } else {
            clearTimersAndAudioContext();
          }

          activeStream.getTracks().forEach((track) => track.stop());
          streamRef.current = undefined;
          recorderRef.current = undefined;
          if (!mountedRef.current) return;
          if (stopReasonRef.current === "cancelled") {
            setVoiceStatus("idle");
            liveShouldStopRef.current = false;
            return;
          }
          if (stopReasonRef.current === "no-speech") {
            setVoiceStatus("idle");
            setNotice("I didn’t hear anything. Tap the ball and try again.");
            liveShouldStopRef.current = false;
            liveErrorRef.current = null;
            setLivePartial("");
            return;
          }

          const liveText = liveTranscriptRef.current.trim();
          if (liveText) {
            setLivePartial("");
            liveShouldStopRef.current = false;
            liveErrorRef.current = null;
            await handleFinalTranscript(liveText);
            return;
          }

          // The batch endpoint rejects the live model; surface the live
          // failure (for example stt_not_streaming) instead of hanging.
          const isLiveModel =
            (preferences?.transcriptionModel as string | undefined) ===
            "gemini-3.5-transcribe-live";
          if (isLiveModel) {
            setVoiceStatus("idle");
            const liveErr = liveErrorRef.current;
            setNotice(
              liveErr ??
                (liveShouldStopRef.current
                  ? "Live transcription didn't return any speech. Try again or hold the mic closer."
                  : "Live transcription did not capture any speech. Try again."),
            );
            setLivePartial("");
            liveErrorRef.current = null;
            liveShouldStopRef.current = false;
            return;
          }

          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          if (blob.size) {
            liveShouldStopRef.current = false;
            setVoiceStatus("thinking");
            await transcribeFallback(blob);
          } else {
            setVoiceStatus("idle");
            setNotice("No audio was captured. Try again.");
            liveShouldStopRef.current = false;
          }
        })();
      });
      recorder.start(250);
      setVoiceStatus("listening");
      liveTranscriptRef.current = "";
      liveErrorRef.current = null;
      setLivePartial("");
      liveShouldStopRef.current = false;

      // Live browser speech recognition if supported
      const SpeechRecognitionClass =
        typeof window !== "undefined"
          ? (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
              .SpeechRecognition ||
            (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
              .webkitSpeechRecognition
          : undefined;

      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang =
            typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
          speechRecognitionRef.current = recognition;

          recognition.onresult = (event: any) => {
            if (!mountedRef.current) return;
            let full = "";
            for (let i = 0; i < event.results.length; ++i) {
              const item = event.results[i];
              if (item && item[0]) {
                full += item[0].transcript;
              }
            }
            const trimmed = full.trim();
            if (trimmed) {
              liveTranscriptRef.current = trimmed;
              setLivePartial(trimmed);
              heardSpeechRef.current = true;
              lastSpeechAtRef.current = Date.now();
            }
          };

          recognition.onspeechend = () => {
            if (heardSpeechRef.current) {
              window.setTimeout(() => {
                if (
                  mountedRef.current &&
                  recorderRef.current?.state === "recording" &&
                  heardSpeechRef.current &&
                  Date.now() - lastSpeechAtRef.current >= 800
                ) {
                  stopRecording("silence");
                }
              }, 800);
            }
          };

          recognition.onerror = () => {
            // Non-fatal: batch MediaRecorder continues capturing
          };

          recognition.start();
        } catch {
          // Ignore SpeechRecognition start failure
        }
      }

      // Dual capture: live stream plus MediaRecorder batch fallback.
      const isLiveModel =
        (preferences?.transcriptionModel as string | undefined) ===
        "gemini-3.5-transcribe-live";
      if (isLiveModel) {
        const livePromise = startLiveTranscriptionSession(workspace, activeStream, {
          onPartial: (partial) => {
            if (!mountedRef.current) return;
            liveTranscriptRef.current = partial;
            setLivePartial(partial);
            heardSpeechRef.current = true;
            lastSpeechAtRef.current = Date.now();
          },
          onFinal: (final) => {
            if (!mountedRef.current) return;
            liveTranscriptRef.current = final;
            setLivePartial(final);
            heardSpeechRef.current = true;
            lastSpeechAtRef.current = Date.now();
          },
          onError: (error) => {
            liveErrorRef.current = error.message;
            if (mountedRef.current && !liveTranscriptRef.current) {
              setNotice(error.message);
            }
          },
        });
        liveSessionPromiseRef.current = livePromise;
        void livePromise
          .then((session) => {
            liveSessionPromiseRef.current = null;
            if (!mountedRef.current) {
              void session.stop().catch(() => {});
              return;
            }
            if (liveShouldStopRef.current) {
              liveSessionRef.current = session;
              return;
            }
            liveSessionRef.current = session;
          })
          .catch((error) => {
            liveSessionPromiseRef.current = null;
            if (mountedRef.current && error instanceof Error) {
              liveErrorRef.current = error.message;
              if (!liveTranscriptRef.current) setNotice(error.message);
            }
          });
      }

      stopReasonRef.current = "manual";
      stopTimerRef.current = window.setTimeout(() => stopRecording("limit"), MAX_RECORDING_MS);
      void monitorVoiceActivity(activeStream).catch(() => {
        clearTimersAndAudioContext();
        stopTimerRef.current = window.setTimeout(() => stopRecording("limit"), MAX_RECORDING_MS);
      });
    } catch (error) {
      clearRecordingResources();
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = undefined;
      if (mountedRef.current) {
        setVoiceStatus("idle");
        setNotice(errorMessage(error));
      }
    }
  }

  function stopRecording(reason: StopReason = "manual") {
    stopReasonRef.current = reason;
    liveShouldStopRef.current = true;
    window.clearTimeout(stopTimerRef.current);
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function handleOrbClick() {
    if (!consented) {
      void enableVoice();
      return;
    }
    if (status === "listening") stopRecording("manual");
    else if (status === "idle") void startRecording();
  }

  return (
    <div className="assistant-voice-conversation" role="dialog" aria-label="Voice conversation">
      <div className="assistant-voice-conversation-topbar">
        <div className="assistant-voice-conversation-title">
          <strong>Voice chat</strong>
          <small>Bright Female · spoken replies</small>
        </div>
        <button
          type="button"
          className="assistant-voice-conversation-close"
          onClick={() => {
            if (statusRef.current === "listening") stopRecording("cancelled");
            stopPlayback();
            onClose();
          }}
          aria-label="Back to text chat"
        >
          <X size={18} aria-hidden="true" /> Text chat
        </button>
      </div>

      {!preferences && !prefsError ? (
        <div className="assistant-voice-conversation-loading" role="status">
          <LoaderCircle className="spinning" size={20} aria-hidden="true" />
          <span>Preparing voice chat…</span>
        </div>
      ) : prefsError ? (
        <div className="assistant-voice-conversation-notice" role="alert">
          <p>{prefsError}</p>
          <button type="button" className="button primary compact" onClick={onClose}>
            Back to text chat
          </button>
        </div>
      ) : !consented ? (
        <div
          className="assistant-voice-conversation-notice"
          role="dialog"
          aria-label="Voice consent"
        >
          <strong>Talk to {assistantName}?</strong>
          <p>
            Your recording is sent to Cloudflare Workers AI for transcription. After you finish
            speaking, the completed reply text is sent to Fish Audio for speech. Zoption does not
            store recordings or generated audio.
          </p>
          {notice && (
            <p className="assistant-voice-conversation-error" role="alert">
              {notice}
            </p>
          )}
          <div className="assistant-voice-conversation-notice-actions">
            <button type="button" className="button secondary compact" onClick={onClose}>
              Not now
            </button>
            <button
              type="button"
              className="button primary compact"
              disabled={enabling}
              onClick={() => void enableVoice()}
            >
              {enabling ? "Enabling voice…" : "Accept and continue"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="assistant-voice-conversation-captions"
            aria-live="polite"
            aria-label="Conversation captions"
          >
            {captions.length === 0 && !livePartial && status === "idle" && (
              <p className="assistant-voice-conversation-empty">
                Tap the ball and ask about spending, budgets, recurring charges, goals, or debt.
              </p>
            )}
            {captions.map((caption) => (
              <p
                key={caption.id}
                className={
                  caption.role === "user"
                    ? "assistant-voice-caption-user"
                    : "assistant-voice-caption-assistant"
                }
              >
                <span className="assistant-voice-caption-speaker">
                  {caption.role === "user" ? "You" : assistantName}
                </span>
                <span>
                  {caption.role === "assistant" &&
                  caption.id === speakingId &&
                  status === "speaking" &&
                  typedCount < typingFull.length
                    ? renderVoiceCaptionContent(`${typingFull.slice(0, typedCount)}▍`)
                    : caption.role === "assistant"
                      ? renderVoiceCaptionContent(caption.text)
                      : caption.text}
                </span>
              </p>
            ))}
            {livePartial && (
              <p className="assistant-voice-caption-user assistant-voice-caption-live">
                <span className="assistant-voice-caption-speaker">You</span>
                <span>“{livePartial}”</span>
              </p>
            )}
            {status === "thinking" && (
              <p className="assistant-voice-caption-status" role="status">
                Checking your records…
              </p>
            )}
            <div ref={captionsEndRef} />
          </div>

          <div className="assistant-voice-conversation-stage">
            <button
              type="button"
              className={`assistant-voice-orb assistant-voice-orb-${status}`}
              onClick={handleOrbClick}
              disabled={status === "thinking" || status === "speaking"}
              aria-label={
                status === "listening"
                  ? "Stop listening"
                  : status === "thinking"
                    ? "Assistant is thinking"
                    : status === "speaking"
                      ? "Assistant is speaking"
                      : "Start talking"
              }
            >
              {status === "thinking" ? (
                <LoaderCircle className="spinning" size={30} aria-hidden="true" />
              ) : (
                <Mic size={30} aria-hidden="true" />
              )}
            </button>
            <p className="assistant-voice-conversation-status" role="status">
              {STATUS_LABEL[status]}
            </p>
            {notice && (
              <p className="assistant-voice-conversation-error" role="alert">
                {notice}
              </p>
            )}
            {audioError && (
              <p className="assistant-voice-conversation-error" role="alert">
                {audioError}
              </p>
            )}
          </div>
        </>
      )}
      {busy && <span className="sr-only">Voice conversation is active</span>}
    </div>
  );
}
