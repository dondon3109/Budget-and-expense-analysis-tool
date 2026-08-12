import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantVoicePreferences,
} from "@zoption/shared";
import { Mic, Settings2, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getAssistantVoicePreferences,
  grantAssistantVoiceConsent,
  transcribeAssistantVoice,
} from "../../lib/api";
import type { AuthenticatedWorkspace } from "../../lib/workspace";

const MAX_RECORDING_MS = 60_000;
const NO_SPEECH_TIMEOUT_MS = 7_000;
const ENDING_SILENCE_MS = 1_400;
const VOICE_SAMPLE_INTERVAL_MS = 100;
const SPEECH_RMS_THRESHOLD = 0.025;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

export type AssistantVoiceSubmissionMode = "review" | "automatic";
export type AssistantVoiceReplyMode = "spoken" | "text";

export interface AssistantVoiceTranscriptOptions {
  submissionMode: AssistantVoiceSubmissionMode;
  replyMode: AssistantVoiceReplyMode;
}

type StoredVoiceOptions = AssistantVoiceTranscriptOptions;

type StopReason = "manual" | "silence" | "no-speech" | "limit" | "cancelled";

interface AssistantVoiceControlProps {
  workspace: AuthenticatedWorkspace;
  disabled: boolean;
  reviewRequired: boolean;
  onTranscript: (text: string, options: AssistantVoiceTranscriptOptions) => void;
}

function storageKey(userId: string): string {
  return `zoption:assistant-voice-options:${userId}`;
}

function readStoredOptions(userId: string): StoredVoiceOptions | undefined {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const options = parsed as Partial<StoredVoiceOptions>;
    if (
      (options.submissionMode === "review" || options.submissionMode === "automatic") &&
      (options.replyMode === "spoken" || options.replyMode === "text")
    ) {
      return options as StoredVoiceOptions;
    }
  } catch {
    // Storage may be unavailable in hardened browser modes; session defaults still work.
  }
  return undefined;
}

function saveStoredOptions(userId: string, options: StoredVoiceOptions): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(options));
  } catch {
    // Voice remains usable when the browser blocks local storage.
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow it in your browser settings and try again.";
  }
  return error instanceof Error ? error.message : "Voice mode could not start.";
}

export function AssistantVoiceControl({
  workspace,
  disabled,
  reviewRequired,
  onTranscript,
}: AssistantVoiceControlProps) {
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const activityTimerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const stopReasonRef = useRef<StopReason>("manual");
  const mountedRef = useRef(true);
  const chunksRef = useRef<Blob[]>([]);
  const microphoneButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const [preferences, setPreferences] = useState<AssistantVoicePreferences>();
  const [showNotice, setShowNotice] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing">("idle");
  const [message, setMessage] = useState<string>();
  const [options, setOptions] = useState<StoredVoiceOptions>(() => {
    const stored = readStoredOptions(workspace.userId);
    return {
      submissionMode: reviewRequired ? "review" : (stored?.submissionMode ?? "review"),
      replyMode: stored?.replyMode ?? "spoken",
    };
  });

  function clearRecordingResources() {
    window.clearTimeout(stopTimerRef.current);
    window.clearInterval(activityTimerRef.current);
    activityTimerRef.current = undefined;
    const audioContext = audioContextRef.current;
    audioContextRef.current = undefined;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
  }

  useEffect(() => {
    mountedRef.current = true;
    let current = true;
    void getAssistantVoicePreferences(workspace)
      .then((data) => {
        if (current) setPreferences(data);
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
    if (!showNotice && !showOptions) return;
    if (showNotice) noticeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (showNotice) {
        setShowNotice(false);
        microphoneButtonRef.current?.focus();
      } else {
        setShowOptions(false);
        settingsButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showNotice, showOptions]);

  function updateOptions(next: StoredVoiceOptions) {
    const enforced = reviewRequired ? { ...next, submissionMode: "review" as const } : next;
    setOptions(enforced);
    saveStoredOptions(workspace.userId, enforced);
  }

  async function transcribe(blob: Blob) {
    setStatus("transcribing");
    try {
      const result = await transcribeAssistantVoice(workspace, blob);
      if (!mountedRef.current) return;
      onTranscript(result.text, options);
      setMessage(
        options.submissionMode === "review"
          ? "Transcript ready — review or edit it, then press Send."
          : "Transcript ready — sending now.",
      );
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

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("Voice recording is not supported in this browser.");
      return;
    }
    try {
      setMessage(undefined);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        clearRecordingResources();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = undefined;
        recorderRef.current = undefined;
        if (stopReasonRef.current === "cancelled") return;
        if (stopReasonRef.current === "no-speech") {
          setStatus("idle");
          setMessage("I didn’t hear anything. Tap the microphone and try again.");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) void transcribe(blob);
        else {
          setStatus("idle");
          setMessage("No audio was captured. Try again.");
        }
      });
      recorder.start(250);
      setStatus("recording");
      stopReasonRef.current = "manual";
      stopTimerRef.current = window.setTimeout(() => stopRecording("limit"), MAX_RECORDING_MS);
      void monitorVoiceActivity(stream).catch(() => {
        // Browsers without Web Audio still retain manual stop and the hard recording limit.
        clearRecordingResources();
        stopTimerRef.current = window.setTimeout(() => stopRecording("limit"), MAX_RECORDING_MS);
      });
    } catch (error) {
      clearRecordingResources();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setStatus("idle");
      setMessage(errorMessage(error));
    }
  }

  function stopRecording(reason: StopReason = "manual") {
    stopReasonRef.current = reason;
    clearRecordingResources();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function enableVoice() {
    try {
      const data = await grantAssistantVoiceConsent(workspace);
      setPreferences(data);
      setShowNotice(false);
      await startRecording();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  const consented = Boolean(
    preferences?.consentedAt &&
    preferences.consentVersion === CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  );
  const busy = disabled || status === "transcribing";

  return (
    <div className="assistant-voice-control">
      <button
        ref={settingsButtonRef}
        className="assistant-voice-settings-button"
        type="button"
        disabled={status !== "idle"}
        aria-label="Voice settings"
        aria-expanded={showOptions}
        onClick={() => {
          setShowNotice(false);
          setShowOptions((current) => !current);
        }}
      >
        <Settings2 size={15} aria-hidden="true" />
      </button>
      <button
        ref={microphoneButtonRef}
        className={`assistant-voice-button ${status === "recording" ? "recording" : ""}`}
        type="button"
        disabled={busy}
        aria-label={status === "recording" ? "Stop voice recording" : "Start voice recording"}
        aria-pressed={status === "recording"}
        onClick={() => {
          if (status === "recording") stopRecording("manual");
          else if (!consented) {
            setShowOptions(false);
            setShowNotice(true);
          } else {
            setShowOptions(false);
            void startRecording();
          }
        }}
      >
        {status === "recording" ? <Square size={16} /> : <Mic size={18} />}
      </button>
      {showOptions && (
        <div className="assistant-voice-options" role="dialog" aria-label="Voice settings">
          <div className="assistant-voice-options-header">
            <strong>Voice settings</strong>
            <button
              type="button"
              aria-label="Close voice settings"
              onClick={() => setShowOptions(false)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <fieldset>
            <legend>After recording</legend>
            <label>
              <input
                type="radio"
                name="assistant-voice-submission"
                checked={options.submissionMode === "review"}
                onChange={() => updateOptions({ ...options, submissionMode: "review" })}
              />
              <span>
                <strong>Review first</strong>
                <small>Check or edit the transcript before it is sent.</small>
              </span>
            </label>
            <label className={reviewRequired ? "disabled" : ""}>
              <input
                type="radio"
                name="assistant-voice-submission"
                checked={options.submissionMode === "automatic"}
                disabled={reviewRequired}
                onChange={() => updateOptions({ ...options, submissionMode: "automatic" })}
              />
              <span>
                <strong>Send automatically</strong>
                <small>Send only after transcription is complete.</small>
              </span>
            </label>
          </fieldset>
          <fieldset>
            <legend>Assistant replies</legend>
            <label>
              <input
                type="radio"
                name="assistant-voice-reply"
                checked={options.replyMode === "spoken"}
                onChange={() => updateOptions({ ...options, replyMode: "spoken" })}
              />
              <span>
                <strong>Spoken + text</strong>
                <small>Play the answer aloud and keep it in chat.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="assistant-voice-reply"
                checked={options.replyMode === "text"}
                onChange={() => updateOptions({ ...options, replyMode: "text" })}
              />
              <span>
                <strong>Text only</strong>
                <small>Keep the answer silent.</small>
              </span>
            </label>
          </fieldset>
          <p>Recording stops automatically after you finish speaking.</p>
        </div>
      )}
      {showNotice && (
        <div
          ref={noticeRef}
          className="assistant-voice-notice"
          role="dialog"
          aria-label="Voice notice"
          tabIndex={-1}
        >
          <strong>Enable voice mode?</strong>
          <p>
            Your recording is sent to Cloudflare Workers AI for transcription. You can choose
            whether to review the finished transcript or send it automatically. When you choose
            spoken replies, the completed assistant reply text is sent to Fish Audio for speech.
            Zoption does not store recordings or generated audio. Voice starts with
            Cloudflare&apos;s and Fish Audio&apos;s free usage options.
          </p>
          <div>
            <button
              type="button"
              className="button secondary compact"
              onClick={() => setShowNotice(false)}
            >
              Not now
            </button>
            <button
              type="button"
              className="button primary compact"
              onClick={() => void enableVoice()}
            >
              Accept and record
            </button>
          </div>
        </div>
      )}
      {(message || status !== "idle") && (
        <span className="assistant-voice-status" role="status" aria-live="polite">
          {status === "recording"
            ? "Listening — I’ll stop after you finish speaking."
            : status === "transcribing"
              ? "Transcribing…"
              : message}
        </span>
      )}
    </div>
  );
}
