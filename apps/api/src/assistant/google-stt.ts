import type { Bindings } from "../types";
import { AssistantVoiceProviderError, type AssistantVoiceTranscriptionProvider } from "./voice-provider";

/**
 * Google Cloud Speech-to-Text V2 - REST Recognize (short audio, <60s)
 * Dedicated STT provider for chirp_3. NOT Gemini Live.
 *
 * Spike conclusion (2026-08-27): StreamingRecognize is gRPC-only and NOT viable
 * directly in Cloudflare Workers (Workers lack Node http2/gRPC). This adapter
 * uses REST `Recognize` (HTTP/JSON) which works in Workers for short utterances.
 * Full realtime streaming will require a proxy (e.g., Cloud Run gRPC bridge) or
 * use of Gemini Live WebSocket as a separate provider. See spike:
 * apps/api/tests/spike-google-grpc.test.ts
 *
 * Credential model (encrypted at rest, per spec #13):
 * - Encrypted secret is opaque JSON or token string.
 * - For V2, recommend JSON: `{"projectId":"my-project","location":"us","accessToken":"ya29..."}`
 * - Legacy: raw Bearer token or API key (if using Gemini path, not here)
 * - This adapter parses JSON to extract projectId/location/token.
 */

const DEFAULT_LOCATION = "us";
const REST_RECOGNIZE_TIMEOUT_MS = 30_000;

function parseGoogleSecret(secret: string): { projectId: string | null; location: string; token: string } {
  const trimmed = secret.trim();
  // Try JSON
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === "object") {
      const projectId = typeof obj.projectId === "string" ? obj.projectId : typeof obj.project_id === "string" ? obj.project_id : null;
      const token = typeof obj.accessToken === "string" ? obj.accessToken : typeof obj.token === "string" ? obj.token : trimmed;
      const location = typeof obj.location === "string" ? obj.location : DEFAULT_LOCATION;
      return { projectId, location, token };
    }
  } catch {
    // not JSON, treat as raw token
  }
  return { projectId: null, location: DEFAULT_LOCATION, token: trimmed };
}

function timeoutMs(env: Bindings): number {
  const v = Number(env.ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(v) && v >= 5_000 && v <= 60_000 ? v : REST_RECOGNIZE_TIMEOUT_MS;
}

export function createGoogleSttProvider(model: string = "chirp_3", apiKeyOverride?: string): AssistantVoiceTranscriptionProvider {
  return {
    async transcribe(env, audio) {
      const secret = apiKeyOverride?.trim() || "";
      if (!secret) throw new AssistantVoiceProviderError("google" as any, "configuration");

      const { projectId, location, token } = parseGoogleSecret(secret);
      if (!projectId) {
        // Without projectId we cannot form V2 Recognizer path; fail as configuration
        throw new AssistantVoiceProviderError("google" as any, "configuration");
      }
      if (!token) throw new AssistantVoiceProviderError("google" as any, "configuration");

      // V2 REST Recognize expects base64 audio and config
      const arrayBuf = await audio.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      const b64 = btoa(binary);
      // Use model from param, fallback to env or chirp_3
      const effectiveModel = model?.trim() || "chirp_3";

      const endpoint = `https://speech.googleapis.com/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs(env));
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-goog-user-project": projectId,
          },
          body: JSON.stringify({
            config: {
              autoDecodingConfig: {},
              languageCodes: ["en-US"],
              model: effectiveModel,
            },
            content: b64,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) throw new AssistantVoiceProviderError("google" as any, "configuration", res.status);
          if (res.status === 429) throw new AssistantVoiceProviderError("google" as any, "rate_limit", res.status);
          if (res.status >= 500) throw new AssistantVoiceProviderError("google" as any, "unavailable", res.status);
          throw new AssistantVoiceProviderError("google" as any, "invalid_response", res.status);
        }
        const data = (await res.json().catch(() => null)) as { results?: Array<{ alternatives?: Array<{ transcript?: string }> }> } | null;
        const transcript = data?.results?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
        if (!transcript) throw new AssistantVoiceProviderError("google" as any, "invalid_response");
        // duration not returned in REST Recognize; estimate from audio
        return { text: transcript, durationSeconds: 0, languageCode: "en-US" };
      } catch (e) {
        if (e instanceof AssistantVoiceProviderError) throw e;
        if (controller.signal.aborted) throw new AssistantVoiceProviderError("google" as any, "timeout");
        throw new AssistantVoiceProviderError("google" as any, "unavailable");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
