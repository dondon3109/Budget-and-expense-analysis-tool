import {
  CURRENT_ASSISTANT_CONSENT_VERSION,
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantMessage,
} from "@zoption/shared";
import { afterAll, describe, expect, it, vi } from "vitest";

import { assistantSpeechText, createAssistantVoiceService } from "../src/assistant/voice-service";
import {
  AssistantVoiceProviderError,
  type AssistantVoiceProviders,
} from "../src/assistant/voice-provider";
import type { AssistantRepository, AssistantVoiceRepository } from "../src/db/assistant";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT_ID = "tenant-id";

const { binding, database } = createD1TestDatabase();
database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT_ID);
afterAll(() => database.close());

const env = {
  DB: binding,
  ASSISTANT_VOICE_ENABLED: "true",
  ASSISTANT_VOICE_REVIEW_REQUIRED: "true",
  FISH_AUDIO_API_KEY: "fish-test-credential",
  FISH_AUDIO_TTS_MODEL: "s2.1-pro-free",
} satisfies Bindings;

function poolRow() {
  return database
    .prepare(
      "SELECT count, allowance FROM billing_monthly_usage WHERE tenant_id = ? AND feature = 'ai_usage'",
    )
    .get(TENANT_ID) as { count: number; allowance: number } | undefined;
}

/** A tenant whose shared pool is already at `used` units. */
function cappedEnvironment(used: number): Bindings {
  const capped = createD1TestDatabase();
  capped.database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')")
    .run(TENANT_ID);
  capped.database
    .prepare(
      "INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance) VALUES (?, date('now','+8 hours','start of month'), 'ai_usage', ?, 500)",
    )
    .run(TENANT_ID, used);
  return { ...env, DB: capped.binding } satisfies Bindings;
}

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
    await expect(service.getPreferences(env, TENANT_ID)).resolves.toMatchObject({
      enabled: true,
      speechAvailable: true,
      reviewRequired: true,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });
  });

  it("keeps voice transcription available when spoken replies are not configured", async () => {
    const service = createAssistantVoiceService(repository(), providers());

    await expect(
      service.getPreferences({ ...env, FISH_AUDIO_API_KEY: undefined }, TENANT_ID),
    ).resolves.toMatchObject({ enabled: true, speechAvailable: false });
  });

  it("requires separate voice consent before audio leaves Zoption", async () => {
    const voiceProviders = providers();
    const service = createAssistantVoiceService(repository(false), voiceProviders);
    const request = service.transcribe(
      env,
      TENANT_ID,
      new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }),
    );
    await expect(request).rejects.toMatchObject({
      status: 409,
      code: "assistant_voice_consent_required",
    });
    expect(voiceProviders.transcription.transcribe).not.toHaveBeenCalled();
  });

  it("draws one unit per voice request from the shared pool before any provider call", async () => {
    const voiceProviders = providers();
    const service = createAssistantVoiceService(repository(), voiceProviders);
    const before = poolRow()?.count ?? 0;

    await service.transcribe(
      env,
      TENANT_ID,
      new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }),
    );
    await service.synthesize(env, TENANT_ID, completedMessage.id, "bright");
    await service.preview(env, TENANT_ID, "energetic");

    expect(poolRow()?.count).toBe(before + 3);
    expect(voiceProviders.transcription.transcribe).toHaveBeenCalledOnce();
    expect(voiceProviders.speech.synthesize).toHaveBeenCalledTimes(2);
  });

  it("refuses at the pool cap before any provider call", async () => {
    const voiceProviders = providers();
    const service = createAssistantVoiceService(repository(), voiceProviders);
    const capped = cappedEnvironment(500);

    await expect(
      service.transcribe(
        capped,
        TENANT_ID,
        new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "monthly_limit_reached",
      message: "You have reached your AI usage limit for this month.",
      details: { feature: "ai_usage", used: 500, limit: 500 },
    });
    await expect(
      service.synthesize(capped, TENANT_ID, completedMessage.id, "bright"),
    ).rejects.toMatchObject({ status: 409, code: "monthly_limit_reached" });
    await expect(service.preview(capped, TENANT_ID, "energetic")).rejects.toMatchObject({
      status: 409,
      code: "monthly_limit_reached",
    });
    expect(voiceProviders.transcription.transcribe).not.toHaveBeenCalled();
    expect(voiceProviders.speech.synthesize).not.toHaveBeenCalled();
  });

  it("speaks only a completed owned message and removes markdown from provider text", async () => {
    const voiceProviders = providers();
    const service = createAssistantVoiceService(repository(), voiceProviders);
    await service.synthesize(env, TENANT_ID, completedMessage.id, "bright");
    expect(voiceProviders.speech.synthesize).toHaveBeenCalledWith(
      env,
      "Result. Your budget is ready.",
      "bright",
    );
  });

  it.each([
    ["PHP 70.00", "70 pesos"],
    ["₱1,250.00", "1,250 pesos"],
    ["PHP 70.50", "70 pesos and 50 centavos"],
    ["₱0.01", "1 centavo"],
    ["-PHP 1.50", "minus 1 peso and 50 centavos"],
  ])("reads %s as %s", (written, spoken) => {
    expect(assistantSpeechText(`You spent ${written} today.`)).toBe(`You spent ${spoken} today.`);
  });

  it.each([
    ["Your total spending this month is PHP 0.00.", "Your total spending this month is 0 pesos."],
    ["Your total this year is PHP 12,450.00.", "Your total this year is 12,450 pesos."],
    ["You paid ₱70.50.", "You paid 70 pesos and 50 centavos."],
  ])("reads sentence-final amounts as words: %s", (written, spoken) => {
    expect(assistantSpeechText(written)).toBe(spoken);
  });

  it("previews a curated voice without sending tenant records", async () => {
    const voiceProviders = providers();
    const service = createAssistantVoiceService(repository(false), voiceProviders);

    await service.preview(env, TENANT_ID, "energetic");

    expect(voiceProviders.speech.synthesize).toHaveBeenCalledWith(
      env,
      "Your total spending is 70 pesos.",
      "energetic",
    );
  });

  it("is unavailable when the production gate is off", async () => {
    const service = createAssistantVoiceService(repository(), providers());
    await expect(
      service.getPreferences({ ...env, ASSISTANT_VOICE_ENABLED: "false" }, TENANT_ID),
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
        TENANT_ID,
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
