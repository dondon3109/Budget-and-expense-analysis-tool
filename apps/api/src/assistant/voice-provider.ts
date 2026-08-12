import type { Bindings } from "../types";

export type AssistantVoiceProviderName = "cloudflare_workers_ai" | "fish_audio";
export type AssistantVoiceProviderErrorKind =
  "configuration" | "timeout" | "rate_limit" | "unavailable" | "invalid_response";

export class AssistantVoiceProviderError extends Error {
  constructor(
    readonly provider: AssistantVoiceProviderName,
    readonly kind: AssistantVoiceProviderErrorKind,
    readonly providerStatus?: number,
  ) {
    super("Assistant voice provider request failed.");
    this.name = "AssistantVoiceProviderError";
  }
}

export interface AssistantVoiceTranscriptionProvider {
  transcribe(
    env: Bindings,
    audio: File,
  ): Promise<{ text: string; durationSeconds: number; languageCode?: string }>;
}

export interface AssistantVoiceSpeechProvider {
  synthesize(env: Bindings, text: string): Promise<Response>;
}

export interface AssistantVoiceProviders {
  transcription: AssistantVoiceTranscriptionProvider;
  speech: AssistantVoiceSpeechProvider;
}
