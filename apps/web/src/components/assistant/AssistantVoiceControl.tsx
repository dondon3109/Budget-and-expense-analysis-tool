import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantVoicePreferences,
} from "@zoption/shared";
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getAssistantVoicePreferences,
  grantAssistantVoiceConsent,
  transcribeAssistantVoice,
} from "../../lib/api";
import type { AuthenticatedWorkspace } from "../../lib/workspace";

const MAX_RECORDING_MS = 60_000;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

interface AssistantVoiceControlProps {
  workspace: AuthenticatedWorkspace;
  disabled: boolean;
  reviewRequired: boolean;
  onTranscript: (text: string) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow it in your browser settings and try again.";
  }
  return error instanceof Error ? error.message : "Voice preview could not start.";
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
  const chunksRef = useRef<Blob[]>([]);
  const microphoneButtonRef = useRef<HTMLButtonElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const [preferences, setPreferences] = useState<AssistantVoicePreferences>();
  const [showNotice, setShowNotice] = useState(false);
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing">("idle");
  const [message, setMessage] = useState<string>();

  useEffect(() => {
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
      window.clearTimeout(stopTimerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [workspace.key]);

  useEffect(() => {
    if (!showNotice) return;
    noticeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setShowNotice(false);
      microphoneButtonRef.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showNotice]);

  async function transcribe(blob: Blob) {
    setStatus("transcribing");
    try {
      const result = await transcribeAssistantVoice(workspace, blob);
      onTranscript(result.text);
      setMessage(
        reviewRequired
          ? "Transcript ready — review or edit it, then press Send."
          : "Transcript sent.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setStatus("idle");
    }
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
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = undefined;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) void transcribe(blob);
        else {
          setStatus("idle");
          setMessage("No audio was captured. Try again.");
        }
      });
      recorder.start(250);
      setStatus("recording");
      stopTimerRef.current = window.setTimeout(() => recorder.stop(), MAX_RECORDING_MS);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setStatus("idle");
      setMessage(errorMessage(error));
    }
  }

  function stopRecording() {
    window.clearTimeout(stopTimerRef.current);
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
        ref={microphoneButtonRef}
        className={`assistant-voice-button ${status === "recording" ? "recording" : ""}`}
        type="button"
        disabled={busy}
        aria-label={status === "recording" ? "Stop voice recording" : "Start voice recording"}
        aria-pressed={status === "recording"}
        onClick={() => {
          if (status === "recording") stopRecording();
          else if (!consented) setShowNotice(true);
          else void startRecording();
        }}
      >
        {status === "recording" ? <Square size={16} /> : <Mic size={18} />}
      </button>
      {showNotice && (
        <div
          ref={noticeRef}
          className="assistant-voice-notice"
          role="dialog"
          aria-label="Voice preview notice"
          tabIndex={-1}
        >
          <strong>Enable voice preview?</strong>
          <p>
            Your recording and the assistant reply text are sent to Fish Audio. Zoption does not
            store recordings or generated audio. Voice is Preview-only and uses Fish’s free TTS
            model; transcription may incur usage charges.
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
            ? "Listening — press stop when finished."
            : status === "transcribing"
              ? "Transcribing…"
              : message}
        </span>
      )}
    </div>
  );
}
