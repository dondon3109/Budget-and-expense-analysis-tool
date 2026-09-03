import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantVoicePreferences,
} from "@zoption/shared";
import { LoaderCircle, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getAssistantVoicePreferences,
  grantAssistantVoiceConsent,
  transcribeAssistantVoice,
} from "../../lib/api";
import {
  startLiveTranscriptionSession,
  type LiveTranscriptionSession,
} from "../../lib/voiceStream";
import type { AuthenticatedWorkspace } from "../../lib/workspace";

const MAX_RECORDING_MS = 60_000;
const NO_SPEECH_TIMEOUT_MS = 7_000;
const ENDING_SILENCE_MS = 1_400;
const VOICE_SAMPLE_INTERVAL_MS = 100;
const SPEECH_RMS_THRESHOLD = 0.025;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

export type AssistantVoiceSubmissionMode = "review";
export type AssistantVoiceReplyMode = "spoken" | "text";

export interface AssistantVoiceTranscriptOptions {
  submissionMode: AssistantVoiceSubmissionMode;
  replyMode: AssistantVoiceReplyMode;
  speechVoice: "default" | "bright" | "energetic";
}

/**
 * Text-chat microphone: speech in, text out. Transcription fills the composer
 * draft; replies are always text. Spoken replies live only in the separate
 * voice conversation surface.
 */
const TEXT_TRANSCRIPT_OPTIONS: AssistantVoiceTranscriptOptions = {
  submissionMode: "review",
  replyMode: "text",
  speechVoice: "default",
};

type StopReason = "manual" | "silence" | "no-speech" | "limit" | "cancelled";

interface AssistantVoiceControlProps {
  workspace: AuthenticatedWorkspace;
  disabled: boolean;
  reviewRequired?: boolean;
  onTranscript: (text: string, options: AssistantVoiceTranscriptOptions) => void;
  onPartialTranscript?: (text: string) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "The voice recording could not be processed.";
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function AssistantVoiceControl({
  workspace,
  disabled,
  onTranscript,
  onPartialTranscript,
}: AssistantVoiceControlProps) {
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const activityTimerRef = useRef<number | undefined>(undefined);
  const elapsedTimerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const liveSessionRef = useRef<LiveTranscriptionSession | null>(null);
  const liveSessionPromiseRef = useRef<Promise<LiveTranscriptionSession> | null>(null);
  const liveTranscriptRef = useRef<string>("");
  const liveErrorRef = useRef<string | null>(null);
  const liveShouldStopRef = useRef(false);
  const stopReasonRef = useRef<StopReason>("manual");
  const mountedRef = useRef(true);
  const chunksRef = useRef<Blob[]>([]);
  const microphoneButtonRef = useRef<HTMLButtonElement | null>(null);
  const pointerDownTimeRef = useRef<number>(0);
  const isPointerRecordingRef = useRef<boolean>(false);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const [preferences, setPreferences] = useState<AssistantVoicePreferences>();
  const [enabling, setEnabling] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing">("idle");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [message, setMessage] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  function clearTimersAndAudioContext() {
    window.clearTimeout(stopTimerRef.current);
    window.clearInterval(activityTimerRef.current);
    activityTimerRef.current = undefined;
    window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = undefined;
    setElapsedSeconds(0);
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
    setElapsedSeconds(0);
    if (liveSessionRef.current) {
      void liveSessionRef.current.stop().catch(() => {});
      liveSessionRef.current = null;
    }
    liveSessionPromiseRef.current = null;
    liveShouldStopRef.current = false;
    liveErrorRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = undefined;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
  }

  useEffect(() => {
    mountedRef.current = true;
    let current = true;
    void getAssistantVoicePreferences(workspace)
      .then((data) => {
        if (!current) return;
        setPreferences(data);
      })
      .catch((error) => {
        if (current) setMessage(errorMessage(error));
      });
    return () => {
      current = false;
      mountedRef.current = false;
      clearRecordingResources();
      stopReasonRef.current = "cancelled";
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [workspace.key]);

  useEffect(() => {
    if (!showNotice) return;
    noticeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || enabling) return;
      setShowNotice(false);
      microphoneButtonRef.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [enabling, showNotice]);

  useEffect(() => {
    if (!disabled) return;
    setMessage(undefined);
  }, [disabled]);

  async function transcribe(blob: Blob) {
    setStatus("transcribing");
    try {
      const result = await transcribeAssistantVoice(workspace, blob);
      if (!mountedRef.current) return;
      onTranscript(result.text, TEXT_TRANSCRIPT_OPTIONS);
      setMessage("Transcript ready — review or edit it, then press Send.");
    } catch (error) {
      if (mountedRef.current) setMessage(errorMessage(error));
    } finally {
      if (mountedRef.current) setStatus("idle");
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
    let heardSpeech = false;
    let lastSpeechAt = startedAt;

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
      if (rms >= SPEECH_RMS_THRESHOLD) {
        heardSpeech = true;
        lastSpeechAt = now;
        return;
      }
      if (heardSpeech && now - lastSpeechAt >= ENDING_SILENCE_MS) {
        stopRecording("silence");
      } else if (!heardSpeech && now - startedAt >= NO_SPEECH_TIMEOUT_MS) {
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
      setMessage(undefined);
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
          // Capture live session state before clearing
          const liveSessionAtStop = liveSessionRef.current;
          const livePromiseAtStop = liveSessionPromiseRef.current;
          const hasLiveSession = Boolean(liveSessionAtStop || livePromiseAtStop);

          // Keep UI in transcribing/finalizing state while awaiting live finalization
          if (hasLiveSession) {
            setStatus("transcribing");
          } else {
            clearTimersAndAudioContext();
          }

          // Await live finalization if a session exists or is still connecting
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
            // Clear timers but keep transcribing status during grace period
            window.clearTimeout(stopTimerRef.current);
            window.clearInterval(activityTimerRef.current);
            activityTimerRef.current = undefined;
            window.clearInterval(elapsedTimerRef.current);
            elapsedTimerRef.current = undefined;
            // Close the monitoring audio context early (live stream has its own)
            const monitoringContext = audioContextRef.current;
            audioContextRef.current = undefined;
            if (monitoringContext && monitoringContext.state !== "closed")
              void monitoringContext.close();
            try {
              await liveFinalization;
            } catch {
              // Ignore live stream errors during finalization shutdown
            }
            setElapsedSeconds(0);
          } else {
            clearTimersAndAudioContext();
          }

          activeStream.getTracks().forEach((track) => track.stop());
          streamRef.current = undefined;
          recorderRef.current = undefined;
          if (stopReasonRef.current === "cancelled") {
            setStatus("idle");
            liveShouldStopRef.current = false;
            return;
          }
          if (stopReasonRef.current === "no-speech") {
            setStatus("idle");
            setMessage("I didn’t hear anything. Tap the microphone and try again.");
            liveShouldStopRef.current = false;
            liveErrorRef.current = null;
            setLiveTranscript("");
            return;
          }

          // If live stream produced a transcript (including delayed final during grace), use it directly!
          const liveText = liveTranscriptRef.current.trim();
          if (liveText) {
            onTranscript(liveText, TEXT_TRANSCRIPT_OPTIONS);
            setMessage("Transcript ready — review or edit it, then press Send.");
            setStatus("idle");
            setLiveTranscript("");
            liveShouldStopRef.current = false;
            liveErrorRef.current = null;
            return;
          }

          // If the active STT model is the dedicated live transcription model, don't fall back to batch
          // — batch POST /transcriptions rejects gemini-3.5-transcribe-live with 400 and shows a confusing error
          // even though the user did use the streaming button. Surface the live failure instead.
          const isLiveModel =
            (preferences?.transcriptionModel as string | undefined) ===
            "gemini-3.5-transcribe-live";
          if (isLiveModel) {
            setStatus("idle");
            const liveErr = liveErrorRef.current;
            if (liveErr) {
              setMessage(liveErr);
            } else {
              setMessage(
                liveShouldStopRef.current
                  ? "Live transcription didn't return any speech. Try again or hold the mic closer."
                  : "Live transcription did not capture any speech. Try again.",
              );
            }
            setLiveTranscript("");
            liveErrorRef.current = null;
            liveShouldStopRef.current = false;
            return;
          }

          // Fall back to batch audio transcription
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          if (blob.size) {
            liveShouldStopRef.current = false;
            void transcribe(blob);
          } else {
            setStatus("idle");
            setMessage("No audio was captured. Try again.");
            liveShouldStopRef.current = false;
          }
        })();
      });
      recorder.start(250);
      setStatus("recording");
      setElapsedSeconds(0);
      liveTranscriptRef.current = "";
      liveErrorRef.current = null;
      setLiveTranscript("");
      liveShouldStopRef.current = false;

      // Attempt live streaming session concurrently (Option A: Gemini Live API)
      // If live fails, the batch MediaRecorder still captures audio for POST /transcriptions fallback.
      const livePromise = startLiveTranscriptionSession(workspace, activeStream, {
        onPartial: (partial) => {
          if (!mountedRef.current) return;
          liveTranscriptRef.current = partial;
          setLiveTranscript(partial);
          onPartialTranscript?.(partial);
        },
        onFinal: (final) => {
          if (!mountedRef.current) return;
          liveTranscriptRef.current = final;
          setLiveTranscript(final);
          onPartialTranscript?.(final);
        },
        onLatency: (metrics) => {
          // Latency instrumentation for Phase 2 — forwarded from worker (t_worker_first_partial)
          // Keep in console for now; could be sent to PostHog later
          if (typeof console !== "undefined" && console.debug) {
            console.debug("[voice] live latency", metrics);
          }
        },
        onError: (error) => {
          liveErrorRef.current = error.message;
          // Surface live error but keep batch fallback — don't hide failures silently
          // 429/503 are surfaced with actionable messages from voiceStream
          if (mountedRef.current) {
            if (!liveTranscriptRef.current) setMessage(error.message);
          }
          if (typeof console !== "undefined" && console.warn) {
            console.warn(
              "[voice] live error",
              error.message,
              (error as unknown as Record<string, unknown>).code,
            );
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
            // User stopped before session opened — keep for stop handler to finalize
            liveSessionRef.current = session;
            return;
          }
          liveSessionRef.current = session;
        })
        .catch((error) => {
          liveSessionPromiseRef.current = null;
          if (mountedRef.current && error instanceof Error) {
            liveErrorRef.current = error.message;
            if (!liveTranscriptRef.current) {
              setMessage(error.message);
            }
          }
        });

      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedSeconds((seconds) => seconds + 1);
      }, 1000);
      stopReasonRef.current = "manual";
      stopTimerRef.current = window.setTimeout(() => stopRecording("limit"), MAX_RECORDING_MS);
      void monitorVoiceActivity(activeStream).catch(() => {
        // Browsers without Web Audio still retain manual stop and the hard recording limit.
        clearTimersAndAudioContext();
        stopTimerRef.current = window.setTimeout(() => stopRecording("limit"), MAX_RECORDING_MS);
      });
    } catch (error) {
      clearRecordingResources();
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = undefined;
      setStatus("idle");
      setMessage(errorMessage(error));
    }
  }

  function stopRecording(reason: StopReason = "manual") {
    stopReasonRef.current = reason;
    liveShouldStopRef.current = true;
    // Keep live session open for finalization grace period — recorder stop handler will await it.
    // Only clear the max-duration timer here; other resources are cleaned after finalization.
    window.clearTimeout(stopTimerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function enableVoice() {
    if (enabling) return;
    setEnabling(true);
    setMessage(undefined);
    let stream: MediaStream | undefined;
    try {
      // Start the permission request from the user's click so mobile browsers retain activation.
      stream = await requestMicrophone();
      const data = await grantAssistantVoiceConsent(workspace);
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setPreferences(data);
      setShowNotice(false);
      await startRecording(stream);
      stream = undefined;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      setMessage(errorMessage(error));
    } finally {
      if (mountedRef.current) setEnabling(false);
    }
  }

  const consented = Boolean(
    preferences?.consentedAt &&
    preferences.consentVersion === CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  );
  const busy = disabled || status === "transcribing";

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    if (busy) return;
    pointerDownTimeRef.current = Date.now();

    if (status === "recording") {
      return;
    }

    if (!consented) {
      setShowNotice(true);
      return;
    }

    isPointerRecordingRef.current = true;
    void startRecording();
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const elapsed = Date.now() - pointerDownTimeRef.current;

    if (!isPointerRecordingRef.current) {
      if (status === "recording") {
        stopRecording("manual");
      }
      return;
    }

    isPointerRecordingRef.current = false;

    // Push-to-talk: If held for >= 400ms, stop recording on release
    if (elapsed >= 400) {
      if (status === "recording" || recorderRef.current?.state === "recording") {
        stopRecording("manual");
      }
    }
  }

  function handlePointerCancel() {
    if (isPointerRecordingRef.current) {
      isPointerRecordingRef.current = false;
      stopRecording("manual");
    }
  }

  return (
    <div className="assistant-voice-control">
      <button
        ref={microphoneButtonRef}
        className={`assistant-voice-button ${status === "recording" ? "recording" : ""}${
          status === "transcribing" ? "transcribing" : ""
        }`}
        type="button"
        disabled={busy}
        aria-label={
          status === "recording"
            ? "Stop voice recording"
            : status === "transcribing"
              ? "Transcribing your voice recording"
              : "Start voice recording"
        }
        aria-pressed={status === "recording"}
        title={
          status === "recording"
            ? "Click to stop recording"
            : "Click to record or press and hold to speak"
        }
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={() => {
          const elapsed = Date.now() - pointerDownTimeRef.current;
          if (pointerDownTimeRef.current > 0 && elapsed >= 400) {
            return;
          }
          if (pointerDownTimeRef.current === 0 || Date.now() - pointerDownTimeRef.current > 500) {
            if (status === "recording") stopRecording("manual");
            else if (!consented) {
              setShowNotice(true);
            } else {
              void startRecording();
            }
          }
        }}
      >
        {status === "transcribing" ? (
          <LoaderCircle className="spinning" size={17} aria-hidden="true" />
        ) : (
          <Mic size={18} aria-hidden="true" />
        )}
      </button>
      {showNotice && (
        <div
          ref={noticeRef}
          className="assistant-voice-notice"
          role="dialog"
          aria-label="Voice notice"
          tabIndex={-1}
        >
          <strong>Enable voice input?</strong>
          <p>
            Your recording is sent to Cloudflare Workers AI for transcription. You can review the
            finished transcript before sending. Zoption does not store recordings. Replies in text
            chat are always text.
          </p>
          <div>
            <button
              type="button"
              className="button secondary compact"
              disabled={enabling}
              onClick={() => setShowNotice(false)}
            >
              Not now
            </button>
            <button
              type="button"
              className="button primary compact"
              disabled={enabling}
              onClick={() => void enableVoice()}
            >
              {enabling ? "Enabling voice…" : "Accept and record"}
            </button>
          </div>
          {message && (
            <p className="assistant-voice-notice-error" role="alert">
              {message}
            </p>
          )}
        </div>
      )}
      {!disabled && !showNotice && (message || status !== "idle") && (
        <span className="assistant-voice-status" role="status" aria-live="polite">
          {status === "recording"
            ? liveTranscript
              ? `“${liveTranscript}”`
              : `Listening · ${formatElapsed(elapsedSeconds)} — I’ll stop after you finish speaking.`
            : status === "transcribing"
              ? "Transcribing…"
              : message}
        </span>
      )}
    </div>
  );
}
