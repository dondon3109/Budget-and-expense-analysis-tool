import {
  CURRENT_ASSISTANT_CONSENT_VERSION,
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantMessage,
} from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { createAssistantVoiceService } from "../src/assistant/voice-service";
import {
  AssistantVoiceProviderError,
  type AssistantVoiceProviders,
} from "../src/assistant/voice-provider";
import type { AssistantRepository, AssistantVoiceRepository } from "../src/db/assistant";
import type { Bindings } from "../src/types";

const env = {
  DB: {} as D1Database,
  ASSISTANT_VOICE_ENABLED: "true",
  ASSISTANT_VOICE_REVIEW_REQUIRED: "true",
  FISH_AUDIO_TTS_MODEL: "s2.1-pro-free",
} satisfies Bindings;

const completedMessage: AssistantMessage = {
  id: "8b127141-49d5-463a-b15f-4bf12f40846e",
  threadId: "thread-id",
  role: "assistant",
  content: "## Result\nYour **budget** is [ready](https://example.com).",
  status: "completed",
  createdAt: "2026-08-12T00:00:00.000Z",
};

function repository(
  voiceConsented = true,
): Pick<AssistantRepository, "getPreferences"> & AssistantVoiceRepository {
  return {
    getPreferences: vi.fn(async () => ({
      consentedAt: "2026-08-12T00:00:00.000Z",
      consentVersion: CURRENT_ASSISTANT_CONSENT_VERSION,
      retentionDays: 90,
      assistantName: "Aster",
      userPreferredName: "Don",
      responseDetail: "concise" as const,
      coachingStyle: "gentle" as const,
    })),
    getVoiceConsent: vi.fn(async () => ({
      consentedAt: voiceConsented ? "2026-08-12T00:00:00.000Z" : null,
      consentVersion: voiceConsented ? CURRENT_ASSISTANT_VOICE_CONSENT_VERSION : 0,
    })),
    grantVoiceConsent: vi.fn(async () => ({
      consentedAt: "2026-08-12T00:00:00.000Z",
      consentVersion: CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
    })),
    getCompletedAssistantMessage: vi.fn(async () => completedMessage),
  };
}

function providers(): AssistantVoiceProviders {
  return {
    transcription: {
      transcribe: vi.fn(async () => ({ text: "Check my budget", durationSeconds: 2 })),
    },
    speech: {
      synthesize: vi.fn(async () => new Response(new Uint8Array([1]))),
    },
  };
}

describe("assistant voice service", () => {
  it("advertises Preview review and the free model", async () => {
    const service = createAssistantVoiceService(repository(), providers());
    await expect(service.getPreferences(env, "tenant-id")).resolves.toMatchObject({
      enabled: true,
      reviewRequired: true,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });
  });

  it("requires separate voice consent before audio leaves Zoption", async () => {
    const voiceProviders = providers();
    const service = createAssistantVoiceService(repository(false), voiceProviders);
    const request = service.transcribe(
      env,
      "tenant-id",
      new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }),
    );
    await expect(request).rejects.toMatchObject({
      status: 409,
      code: "assistant_voice_consent_required",
    });
    expect(voiceProviders.transcription.transcribe).not.toHaveBeenCalled();
  });

  it("speaks only a completed owned message and removes markdown from provider text", async () => {
    const voiceProviders = providers();
    const service = createAssistantVoiceService(repository(), voiceProviders);
    await service.synthesize(env, "tenant-id", completedMessage.id);
    expect(voiceProviders.speech.synthesize).toHaveBeenCalledWith(
      env,
      "Result. Your budget is ready.",
    );
  });

  it("is unavailable when the production gate is off", async () => {
    const service = createAssistantVoiceService(repository(), providers());
    await expect(
      service.getPreferences({ ...env, ASSISTANT_VOICE_ENABLED: "false" }, "tenant-id"),
    ).rejects.toMatchObject({ status: 404, code: "assistant_voice_not_enabled" });
  });

  it("reports provider failures without exposing credentials or response bodies", async () => {
    const voiceProviders = providers();
    vi.mocked(voiceProviders.transcription.transcribe).mockRejectedValueOnce(
      new AssistantVoiceProviderError("cloudflare_workers_ai", "unavailable", 503),
    );
    const reporter = vi.fn();
    const service = createAssistantVoiceService(repository(), voiceProviders, reporter);

    await expect(
      service.transcribe(
        env,
        "tenant-id",
        new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }),
      ),
    ).rejects.toMatchObject({ status: 503, code: "assistant_voice_unavailable" });
    expect(reporter).toHaveBeenCalledWith({
      event: "assistant_voice_provider_failure",
      provider: "cloudflare_workers_ai",
      kind: "unavailable",
      providerStatus: 503,
    });
  });
});
