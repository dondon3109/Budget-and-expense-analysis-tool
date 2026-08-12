import {
  CURRENT_ASSISTANT_CONSENT_VERSION,
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantVoicePreferences,
  type AssistantVoiceTranscription,
} from "@zoption/shared";

import type { AssistantRepository, AssistantVoiceRepository } from "../db/assistant";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { CLOUDFLARE_WHISPER_MODEL } from "./cloudflare-whisper";
import { AssistantVoiceProviderError, type AssistantVoiceProviders } from "./voice-provider";

const FREE_TTS_MODEL = "s2.1-pro-free" as const;
const MAX_SPEECH_CHARACTERS = 6_000;

export interface AssistantVoiceService {
  getPreferences(env: Bindings, tenantId: string): Promise<AssistantVoicePreferences>;
  grantConsent(env: Bindings, tenantId: string): Promise<AssistantVoicePreferences>;
  transcribe(env: Bindings, tenantId: string, audio: File): Promise<AssistantVoiceTranscription>;
  synthesize(env: Bindings, tenantId: string, messageId: string): Promise<Response>;
}

export interface AssistantVoiceProviderFailureEvent {
  event: "assistant_voice_provider_failure";
  provider: AssistantVoiceProviderError["provider"];
  kind: AssistantVoiceProviderError["kind"];
  providerStatus?: number;
}

export type AssistantVoiceDiagnosticReporter = (event: AssistantVoiceProviderFailureEvent) => void;

function defaultDiagnosticReporter(event: AssistantVoiceProviderFailureEvent): void {
  console.warn(JSON.stringify(event));
}

function reportProviderFailure(
  error: AssistantVoiceProviderError,
  reporter: AssistantVoiceDiagnosticReporter,
): void {
  const event: AssistantVoiceProviderFailureEvent = {
    event: "assistant_voice_provider_failure",
    provider: error.provider,
    kind: error.kind,
    ...(error.providerStatus === undefined ? {} : { providerStatus: error.providerStatus }),
  };
  try {
    reporter(event);
  } catch {
    // Operational diagnostics must never alter the user-facing voice response.
  }
}

function requireEnabled(env: Bindings): void {
  if (env.ASSISTANT_VOICE_ENABLED !== "true") {
    throw new HttpError(404, "assistant_voice_not_enabled", "Voice preview is not available.");
  }
}

function mapProviderError(error: unknown, reporter: AssistantVoiceDiagnosticReporter): never {
  if (!(error instanceof AssistantVoiceProviderError)) throw error;
  reportProviderFailure(error, reporter);
  if (error.kind === "timeout") {
    throw new HttpError(
      504,
      "assistant_voice_timeout",
      "Voice processing took too long. Try again.",
    );
  }
  if (error.kind === "rate_limit") {
    throw new HttpError(
      429,
      "assistant_voice_rate_limited",
      "Voice preview is busy. Try again shortly.",
    );
  }
  if (error.kind === "invalid_response") {
    throw new HttpError(
      502,
      "assistant_voice_invalid_response",
      "Voice processing returned an invalid response.",
    );
  }
  throw new HttpError(
    503,
    "assistant_voice_unavailable",
    "Voice preview is temporarily unavailable.",
  );
}

function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " Code example omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)]\([^\s)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_CHARACTERS);
}

export function createAssistantVoiceService(
  repository: Pick<AssistantRepository, "getPreferences"> & AssistantVoiceRepository,
  providers: AssistantVoiceProviders,
  reporter: AssistantVoiceDiagnosticReporter = defaultDiagnosticReporter,
): AssistantVoiceService {
  async function requireConsent(env: Bindings, tenantId: string): Promise<void> {
    requireEnabled(env);
    const [assistant, voice] = await Promise.all([
      repository.getPreferences(env, tenantId),
      repository.getVoiceConsent(env, tenantId),
    ]);
    if (!assistant.consentedAt || assistant.consentVersion !== CURRENT_ASSISTANT_CONSENT_VERSION) {
      throw new HttpError(
        409,
        "assistant_consent_required",
        "Accept the AI data-sharing notice first.",
      );
    }
    if (!voice.consentedAt || voice.consentVersion !== CURRENT_ASSISTANT_VOICE_CONSENT_VERSION) {
      throw new HttpError(
        409,
        "assistant_voice_consent_required",
        "Accept the voice preview notice first.",
      );
    }
  }

  async function preferences(env: Bindings, tenantId: string): Promise<AssistantVoicePreferences> {
    requireEnabled(env);
    const consent = await repository.getVoiceConsent(env, tenantId);
    return {
      enabled: true,
      reviewRequired: env.ASSISTANT_VOICE_REVIEW_REQUIRED !== "false",
      consentedAt: consent.consentedAt,
      consentVersion: consent.consentVersion,
      transcriptionModel: CLOUDFLARE_WHISPER_MODEL,
      ttsModel: FREE_TTS_MODEL,
    };
  }

  return {
    getPreferences: preferences,
    async grantConsent(env, tenantId) {
      requireEnabled(env);
      await repository.grantVoiceConsent(env, tenantId);
      return preferences(env, tenantId);
    },
    async transcribe(env, tenantId, audio) {
      await requireConsent(env, tenantId);
      try {
        return await providers.transcription.transcribe(env, audio);
      } catch (error) {
        return mapProviderError(error, reporter);
      }
    },
    async synthesize(env, tenantId, messageId) {
      await requireConsent(env, tenantId);
      const message = await repository.getCompletedAssistantMessage(env, tenantId, messageId);
      if (!message) {
        throw new HttpError(
          404,
          "assistant_message_not_found",
          "That assistant reply was not found.",
        );
      }
      const text = speechText(message.content);
      if (!text)
        throw new HttpError(422, "assistant_voice_empty_reply", "That reply cannot be read aloud.");
      try {
        return await providers.speech.synthesize(env, text);
      } catch (error) {
        return mapProviderError(error, reporter);
      }
    },
  };
}
