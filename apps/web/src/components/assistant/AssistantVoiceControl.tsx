import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantSpeechVoice,
  type AssistantVoicePreferences,
} from "@zoption/shared";
import { LoaderCircle, Mic, Settings2, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getAssistantVoicePreferences,
  getAssistantVoicePreview,
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
const SPEECH_VOICES: ReadonlyArray<{
  id: AssistantSpeechVoice;
  label: string;
  gender: "Female" | "Male";
  description: string;
}> = [
  {
    id: "default",
    label: "Default",
    gender: "Male",
    description: "Fish Audio’s balanced male voice.",
  },
  {
    id: "bright",
    label: "Bright",
    gender: "Female",
    description: "A bright, lively female voice.",
  },
  {
    id: "energetic",
    label: "Energetic",
    gender: "Female",
    description: "An upbeat, energetic female voice.",
  },
];

export type AssistantVoiceSubmissionMode = "review";
export type AssistantVoiceReplyMode = "spoken" | "text";

export interface AssistantVoiceTranscriptOptions {
  submissionMode: AssistantVoiceSubmissionMode;
  replyMode: AssistantVoiceReplyMode;
  speechVoice: AssistantSpeechVoice;
}

type StoredVoiceOptions = AssistantVoiceTranscriptOptions;

type StopReason = "manual" | "silence" | "no-speech" | "limit" | "cancelled";

interface AssistantVoiceControlProps {
  workspace: AuthenticatedWorkspace;
  disabled: boolean;
  reviewRequired?: boolean;
  onTranscript: (text: string, options: AssistantVoiceTranscriptOptions) => void;
  onPartialTranscript?: (text: string) => void;
}

function storageKey(userId: string): string {
  return `zoption:assistant-voice-options:${userId}`;
}

function voiceModelHintKey(userId: string): string {
  return `zoption:assistant-voice-model-hint:v1:${userId}`;
}

function hasDismissedVoiceModelHint(userId: string): boolean {
  try {
    return window.localStorage.getItem(voiceModelHintKey(userId)) === "true";
  } catch {
    return false;
  }
}

function saveVoiceModelHintDismissal(userId: string): void {
  try {
    window.localStorage.setItem(voiceModelHintKey(userId), "true");
  } catch {
    // The hint can still be dismissed for this session when storage is unavailable.
  }
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
      return {
        submissionMode: "review",
        replyMode: options.replyMode,
        speechVoice:
          options.speechVoice && SPEECH_VOICES.some((voice) => voice.id === options.speechVoice)
            ? options.speechVoice
            : "default",
      };
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
  const liveTranscriptRef = useRef<string>("");
  const liveErrorRef = useRef<string | null>(null);
  const liveShouldStopRef = useRef(false);
  const stopReasonRef = useRef<StopReason>("manual");
  const mountedRef = useRef(true);
  const chunksRef = useRef<Blob[]>([]);
  const microphoneButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const pointerDownTimeRef = useRef<number>(0);
  const isPointerRecordingRef = useRef<boolean>(false);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const [preferences, setPreferences] = useState<AssistantVoicePreferences>();
  const [enabling, setEnabling] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing">("idle");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [message, setMessage] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewError, setPreviewError] = useState<string>();
  const [voiceModelHintDismissed, setVoiceModelHintDismissed] = useState(() =>
    hasDismissedVoiceModelHint(workspace.userId),
  );
  const [options, setOptions] = useState<StoredVoiceOptions>(() => {
    const stored = readStoredOptions(workspace.userId);
    return {
      submissionMode: "review",
      replyMode: stored?.replyMode ?? "spoken",
      speechVoice: stored?.speechVoice ?? "default",
    };
  });

  function clearPreview() {
    previewAudioRef.current?.pause();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = undefined;
    setPreviewUrl(undefined);
  }

  function clearRecordingResources() {
    window.clearTimeout(stopTimerRef.current);
    window.clearInterval(activityTimerRef.current);
    activityTimerRef.current = undefined;
    window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = undefined;
    setElapsedSeconds(0);
    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }
    liveShouldStopRef.current = false;
    liveErrorRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = undefined;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
  }

  useEffect(() => {
    setVoiceModelHintDismissed(hasDismissedVoiceModelHint(workspace.userId));
  }, [workspace.userId]);

  useEffect(() => {
    mountedRef.current = true;
    let current = true;
    void getAssistantVoicePreferences(workspace)
      .then((data) => {
        if (!current) return;
        setPreferences(data);
        if (!data.speechAvailable) {
          setOptions((stored) => {
            if (stored.replyMode === "text") return stored;
            const textOnly = { ...stored, replyMode: "text" as const };
            saveStoredOptions(workspace.userId, textOnly);
            return textOnly;
          });
        }
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
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [workspace.key]);

  useEffect(() => {
    if (!showNotice && !showOptions) return;
    if (showNotice) noticeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || enabling) return;
      if (showNotice) {
        setShowNotice(false);
        microphoneButtonRef.current?.focus();
      } else {
        clearPreview();
        setShowOptions(false);
        settingsButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [enabling, showNotice, showOptions]);

  useEffect(() => {
    if (!disabled) return;
    setMessage(undefined);
    clearPreview();
    setShowOptions(false);
  }, [disabled]);

  function updateOptions(next: StoredVoiceOptions) {
    const enforced = { ...next, submissionMode: "review" as const };
    setOptions(enforced);
    saveStoredOptions(workspace.userId, enforced);
  }

  function dismissVoiceModelHint() {
    setVoiceModelHintDismissed(true);
    saveVoiceModelHintDismissal(workspace.userId);
  }

  function openVoiceSettings() {
    dismissVoiceModelHint();
    setShowNotice(false);
    clearPreview();
    setShowOptions(true);
  }

  async function previewSelectedVoice() {
    if (previewing || !speechAvailable) return;
    setPreviewing(true);
    setPreviewError(undefined);
    try {
      const audio = await getAssistantVoicePreview(workspace, options.speechVoice);
      if (!mountedRef.current) return;
      clearPreview();
      const audioUrl = URL.createObjectURL(audio);
      previewUrlRef.current = audioUrl;
      setPreviewUrl(audioUrl);
    } catch (error) {
      if (mountedRef.current) setPreviewError(errorMessage(error));
    } finally {
      if (mountedRef.current) setPreviewing(false);
    }
  }

  useEffect(() => {
    if (!previewUrl) return;
    void previewAudioRef.current?.play().catch(() => {
      // Some browsers require a second user gesture; native controls remain available.
    });
  }, [previewUrl]);

  async function transcribe(blob: Blob) {
    setStatus("transcribing");
    try {
      const result = await transcribeAssistantVoice(workspace, blob);
      if (!mountedRef.current) return;
      const transcriptOptions =
        preferences?.speechAvailable === false
          ? { ...options, replyMode: "text" as const }
          : options;
      onTranscript(result.text, transcriptOptions);
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
        clearRecordingResources();
        activeStream.getTracks().forEach((track) => track.stop());
        streamRef.current = undefined;
        recorderRef.current = undefined;
        if (stopReasonRef.current === "cancelled") return;
        if (stopReasonRef.current === "no-speech") {
          setStatus("idle");
          setMessage("I didn’t hear anything. Tap the microphone and try again.");
          return;
        }

        // If live stream produced a transcript, use it directly!
        const liveText = liveTranscriptRef.current.trim();
        if (liveText) {
          const transcriptOptions =
            preferences?.speechAvailable === false
              ? { ...options, replyMode: "text" as const }
              : options;
          onTranscript(liveText, transcriptOptions);
          setMessage("Transcript ready — review or edit it, then press Send.");
          setStatus("idle");
          setLiveTranscript("");
          return;
        }

        // If the active STT model is the dedicated live transcription model, don't fall back to batch
        // — batch POST /transcriptions rejects gemini-3.5-transcribe-live with 400 and shows a confusing error
        // even though the user did use the streaming button. Surface the live failure instead.
        const isLiveModel =
          (preferences?.transcriptionModel as string | undefined) === "gemini-3.5-transcribe-live";
        if (isLiveModel) {
          setStatus("idle");
          const liveErr = liveErrorRef.current;
          if (liveErr) {
            setMessage(liveErr);
          } else if (!message || message.includes("Live transcribe")) {
            setMessage(
              liveShouldStopRef.current
                ? "Live transcription didn't return any speech. Try again or hold the mic closer."
                : "Live transcription failed. Check your connection and try again. Batch mode is not available for the live model.",
            );
          }
          setLiveTranscript("");
          liveErrorRef.current = null;
          return;
        }

        // Fall back to batch audio transcription
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) void transcribe(blob);
        else {
          setStatus("idle");
          setMessage("No audio was captured. Try again.");
        }
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
      void startLiveTranscriptionSession(workspace, activeStream, {
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
            console.warn("[voice] live error", error.message, (error as unknown as Record<string, unknown>).code);
          }
        },
      })
        .then((session) => {
          if (!mountedRef.current || liveShouldStopRef.current) {
            session.stop();
            return;
          }
          liveSessionRef.current = session;
        })
        .catch((error) => {
          if (mountedRef.current && error instanceof Error && !liveTranscriptRef.current) {
            // Keep the error visible until batch fallback completes
            setMessage(error.message);
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
        clearRecordingResources();
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
    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }
    clearRecordingResources();
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
  const speechAvailable = preferences?.speechAvailable !== false;
  const busy = disabled || status === "transcribing";
  const showVoiceModelHint =
    !voiceModelHintDismissed &&
    preferences?.speechAvailable === true &&
    !disabled &&
    status === "idle" &&
    !message &&
    !showNotice &&
    !showOptions;

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    if (busy) return;
    pointerDownTimeRef.current = Date.now();

    if (status === "recording") {
      return;
    }

    if (!consented) {
      clearPreview();
      setShowOptions(false);
      setShowNotice(true);
      return;
    }

    clearPreview();
    setShowOptions(false);
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
        ref={settingsButtonRef}
        className="assistant-voice-settings-button"
        type="button"
        disabled={status !== "idle"}
        aria-label="Voice settings"
        aria-expanded={showOptions}
        onClick={() => {
          dismissVoiceModelHint();
          setShowNotice(false);
          setShowOptions((current) => {
            if (current) clearPreview();
            return !current;
          });
        }}
      >
        <Settings2 size={15} aria-hidden="true" />
      </button>
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
              clearPreview();
              setShowOptions(false);
              setShowNotice(true);
            } else {
              clearPreview();
              setShowOptions(false);
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
      {showVoiceModelHint && (
        <aside className="assistant-voice-model-hint" aria-label="Voice model tip">
          <span className="assistant-voice-model-hint-icon" aria-hidden="true">
            <Volume2 size={15} />
          </span>
          <div>
            <strong>Pick a voice you like</strong>
            <p>You can change the voice model anytime in Voice Settings.</p>
            <button type="button" onClick={openVoiceSettings}>
              Choose a voice
            </button>
          </div>
          <button
            type="button"
            className="assistant-voice-model-hint-close"
            aria-label="Dismiss voice model tip"
            onClick={dismissVoiceModelHint}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </aside>
      )}
      {showOptions && (
        <div className="assistant-voice-options" role="dialog" aria-label="Voice settings">
          <div className="assistant-voice-options-header">
            <strong>Voice settings</strong>
            <button
              type="button"
              aria-label="Close voice settings"
              onClick={() => {
                clearPreview();
                setShowOptions(false);
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <fieldset>
            <legend>Assistant replies</legend>
            <label className={speechAvailable ? "" : "disabled"}>
              <input
                type="radio"
                name="assistant-voice-reply"
                checked={options.replyMode === "spoken"}
                disabled={!speechAvailable}
                onChange={() => updateOptions({ ...options, replyMode: "spoken" })}
              />
              <span>
                <strong>Voice + text</strong>
                <small>
                  {speechAvailable
                    ? "Play the answer aloud and keep it in chat."
                    : "Unavailable in this environment. Voice input and text replies still work."}
                </small>
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
          <fieldset className="assistant-voice-style-fieldset" disabled={!speechAvailable}>
            <legend>Voice</legend>
            <div className="assistant-voice-picker">
              <label htmlFor="assistant-speech-voice">Voice and gender</label>
              <select
                id="assistant-speech-voice"
                value={options.speechVoice}
                onChange={(event) => {
                  clearPreview();
                  setPreviewError(undefined);
                  updateOptions({
                    ...options,
                    speechVoice: event.target.value as AssistantSpeechVoice,
                  });
                }}
              >
                {SPEECH_VOICES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label} · {voice.gender}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button secondary compact"
                disabled={previewing || !speechAvailable}
                onClick={() => void previewSelectedVoice()}
              >
                <Volume2 size={14} aria-hidden="true" />
                {previewing ? "Loading…" : "Preview"}
              </button>
            </div>
            <small className="assistant-voice-description">
              {SPEECH_VOICES.find((voice) => voice.id === options.speechVoice)?.description}
            </small>
            {previewUrl && (
              <audio
                ref={previewAudioRef}
                className="assistant-voice-preview-audio"
                src={previewUrl}
                controls
                aria-label={`${
                  SPEECH_VOICES.find((voice) => voice.id === options.speechVoice)?.label
                } voice preview`}
              />
            )}
            {previewError && (
              <small className="assistant-voice-preview-error" role="alert">
                {previewError}
              </small>
            )}
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
            Your recording is sent to Cloudflare Workers AI for transcription. You can review
            the finished transcript before sending. When you choose spoken replies, the completed
            assistant reply text is sent to Fish Audio for speech. Zoption does not store
            recordings or generated audio. Voice starts with Cloudflare&apos;s and Fish
            Audio&apos;s free usage options.
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
