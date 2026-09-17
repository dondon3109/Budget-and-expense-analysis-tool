import { speechRecognitionLang, type VoiceLanguage } from "./voiceLanguage";

// Minimal structural types for the Web Speech API, which has no built-in
// TypeScript declarations. Only the surface used for live captions is modeled.
export interface SpeechRecognitionResultItem {
  readonly transcript: string;
}

export interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionResultItem | undefined;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult | undefined;
}

export interface SpeechRecognitionResultEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onspeechend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

export interface WindowWithSpeechRecognition {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export interface BrowserSpeechOptions {
  language: VoiceLanguage;
  /**
   * The engine has no cross-language auto detect, so an Auto engine is really an
   * English one. Surfaces that also hold a server transcript leave Auto on the
   * server path, which does handle both languages; the voice conversation sets
   * this because on a deployment without the live model the browser engine is
   * its only partial transcript source.
   */
  startForAuto?: boolean;
  /** Flattened transcript of everything the engine has heard so far. */
  onTranscript: (transcript: string) => void;
  /** The engine stopped hearing speech; callers arm their own silence stop. */
  onSpeechEnd: () => void;
}

/**
 * Starts the browser's own speech recognition for live captions and publishes
 * the instance to `recognitionRef` before `start()`, so callers can stop, abort,
 * or retarget it when the voice language changes.
 *
 * Failure to start is not fatal: the MediaRecorder and the server transcription
 * still capture the recording.
 */
export function startBrowserSpeechRecognition(
  recognitionRef: { current: SpeechRecognitionInstance | null },
  options: BrowserSpeechOptions,
): void {
  if (options.language === "auto" && !options.startForAuto) return;

  const SpeechRecognitionClass =
    typeof window !== "undefined"
      ? (window as unknown as WindowWithSpeechRecognition).SpeechRecognition ||
        (window as unknown as WindowWithSpeechRecognition).webkitSpeechRecognition
      : undefined;
  if (!SpeechRecognitionClass) return;

  try {
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechRecognitionLang(options.language);
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let full = "";
      for (let i = 0; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item && item[0]) {
          const chunk = item[0].transcript.trim();
          if (chunk) full = full ? `${full} ${chunk}` : chunk;
        }
      }
      const trimmed = full.trim();
      if (trimmed) options.onTranscript(trimmed);
    };

    recognition.onspeechend = () => options.onSpeechEnd();

    // Non-fatal: the MediaRecorder still captures the audio either way.
    recognition.onerror = () => {};

    recognition.start();
  } catch {
    // Ignore SpeechRecognition start failure
  }
}
