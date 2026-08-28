# Voice Live Transcription — Gemini 3.5 Transcribe Live

**Status:** Live in production (Phases 1-3). Batch `POST /transcriptions` remains fallback.

This runbook covers the realtime path `Browser/Mobile --WSS--> Worker /api/app/assistant/voice/stream --WSS--> Gemini Live` using `gemini-3.5-transcribe-live`. The older Cloud Run `chirp_3` bridge (`docs/realtime-stt-bridge.md`) is still supported for `chirp_3` but is not required for Gemini Live.

## 1. When live is used

| Model (provider_configs) | Endpoint | Live? |
|---|---|---|
| `@cf/openai/whisper-large-v3-turbo` (`cloudflare_workers_ai`) | `POST /transcriptions` | No — `/stream` returns `400 stt_not_streaming` |
| `gemini-3.5-transcribe` (`google`) | `POST /transcriptions` via `generateContent` | No — `/stream` returns `400 stt_not_streaming` (REST-only) |
| `gemini-3.5-transcribe-live` (`google`) | `WSS /stream` → Gemini Bidi | **Yes** |
| `chirp_3` (`google`) | `WSS /stream` → `STT_BRIDGE_URL` | Yes, via bridge (see `realtime-stt-bridge.md`) |

The Web client (`AssistantVoiceControl`) always starts **both** `MediaRecorder` (batch) and `AudioWorklet` (live) concurrently. If `liveTranscript` arrives, it is used directly; otherwise the `Blob` is posted to `/transcriptions`. Mobile (`expo-audio` `AudioStream` 16k Int16) does the same via `startMobileVoiceStream`.

## 2. Activation (admin)

1. **Create credential** `Admin → AI & Voice Models → Credentials` → `google` → paste `AIza...` Google AI Studio API key. The key is encrypted at rest (`provider_credentials.encrypted_secret`, AES-256-GCM) and never leaves the Worker except as `?key=` to `generativelanguage.googleapis.com`.

2. **Create config** `STT → google / gemini-3.5-transcribe-live` → link the credential → **Activate**. This sets `provider_configs.is_active` and calls `providerRegistry.invalidate('stt')` (30s TTL otherwise).

3. **No `STT_BRIDGE_URL` needed** for Gemini Live. Leave empty. For `chirp_3` set `STT_BRIDGE_URL=wss://stt-bridge-xxx.run.app/stream` (Cloud Run, ADC).

4. **Worker env** `ASSISTANT_VOICE_ENABLED=true` (or `wrangler.jsonc` `vars`). `FISH_AUDIO_API_KEY` controls `speechAvailable` for TTS, not STT.

Verify: `GET /api/app/admin/provider-configs/health` → `stt: google / gemini-3.5-transcribe-live ••••7890 (encrypted)` and `GET /api/app/assistant/voice/preferences` → `transcriptionModel: "gemini-3.5-transcribe-live"`.

## 3. Architecture

```
Web:  MediaStream 16kHz → AudioWorklet (patches/pcm-worklet.js, Int16) --ArrayBuffer(256ms)--> WSS /stream
Mobile: AudioStream 16kHz Int16 PCM --base64 JSON {type:"audio",pcm}--> WSS /stream
Worker:  Hono GET /stream (auth: Supabase JWT via ?token= or Sec-WebSocket-Protocol, tenant global)
         → providerRegistry.getActive('stt') → getDecryptedSecret
         → if live model + AIza → wss://generativelanguage.googleapis.com/ws/.../BidiGenerateContent?key=AIza
           setup: {model:"models/gemini-3.5-transcribe-live", generationConfig:{responseModalities:["TEXT"]}, inputAudioTranscription:{}}
           realtime_input: {media_chunks: [{mime_type:"audio/pcm;rate=16000", data:b64}]} (also sent as realtimeInput for compat)
           <- serverContent.inputTranscription.text || modelTurn.parts[].text (accumulated until turnComplete)
           -> browser {type:"partial"|"final", transcript, t_worker_first_partial, latency_worker_to_first_partial}
         → else if chirp_3 → proxy to STT_BRIDGE_URL (gRPC streamingRecognize)
         → else 400/503
```

Batch fallback: `POST /transcriptions` → `google-stt.ts` REST `generateContent` for `gemini-3.5-transcribe` (blocks `gemini-3.5-transcribe-live` with `400 live_requires_stream`).

## 4. Env & feature flags

* `ASSISTANT_VOICE_ENABLED` — `true` to expose voice UI. Frontend `__ASSISTANT_VOICE_ENABLED__` (vite `define`) gates `AssistantVoiceControl`. Tests set `false`.
* `ASSISTANT_VOICE_REVIEW_REQUIRED` — `true` (default) forces `submissionMode="review"`; `Send automatically` was removed. No `STT` impact.
* `STT_BRIDGE_URL` — only for `chirp_3`. Empty for Gemini Live.
* `GOOGLE_STT_API_KEY` / `GOOGLE_CLOUD_PROJECT` — legacy env fallbacks (migrate to DB credential).

## 5. Testing

* **Unit:** `pnpm vitest run apps/web/tests/voice-stream.test.ts apps/api/tests/voice-stream.test.ts` — checks `AudioWorklet` fallback, PCM `ArrayBuffer` send, `partial`/`final`, `t_worker_first_partial` latency forwarding, `rate_limit` → `"Voice mode is busy..."`, `gemini_missing_key` 503, and that live setup contains `inputAudioTranscription` and `models/gemini-3.5-transcribe-live`.
* **Manual Web:** Chrome 120+ → enable `gemini-3.5-transcribe-live` → mic → `ws` panel shows `101` to `generativelanguage`, `partial` grey within ~250ms, `final` commits on silence/stop. Check console `[voice] live latency {t_worker_first_partial, latency}`.
* **Manual Mobile:** Dev-client build (not Expo Go) → `expo-audio` `AudioStream` must be `function` (`typeof AudioModule.AudioStream`). If missing, client returns no-op session and falls back to file upload (no WSS opened).
* **Negative:** Activate `gemini-3.5-transcribe` (REST) and hit live button → `400 stt_not_streaming` toast. Activate live with no credential → `503 gemini_missing_key`.

## 6. Latency instrumentation

Worker emits `t_worker_first_partial` and `latency_worker_to_first_partial` (`Date.now() - tWorkerOpen`) on first `partial`. Client forwards to `onLatency` (`voiceStream.ts` + `mobile/voice-stream.ts`) and logs `console.debug("[voice] live latency")`. Wire to PostHog by adding `onLatency` handler in `AssistantVoiceControl`/`assistant-voice-hooks` — no transcript content is sent, only timing.

## 7. Troubleshooting

| Symptom | Code | Fix |
|---|---|---|
| `400 stt_not_streaming` on `/stream` | active provider is `cloudflare` or `gemini-3.5-transcribe` | Activate `gemini-3.5-transcribe-live` |
| `503 gemini_missing_key` | live model but credential not `AIza` | Link Google AI Studio API key credential |
| `503 bridge_not_configured` | `chirp_3` without `STT_BRIDGE_URL` | Set `STT_BRIDGE_URL` or switch to Gemini Live |
| `1011 gemini_connect_failed` | key invalid, quota, or network | Check key, `generativelanguage` status, WAF |
| No `partial` but `final` arrives | `AudioWorklet` fallback to `ScriptProcessor` with 4096 buffer | Expected 256ms chunks; check `audioContext.sampleRate` is 16000 (iOS may use 48000 — still sent as 16k, accuracy drops) |
| Mobile shows no partial | `typeof AudioModule.AudioStream !== "function"` in Expo Go | Use dev-client build; Expo Go does not bundle `AudioStream` |
| `429 Voice mode is busy` | `rate_limit` from Google | Backoff, check quota |

## 8. Fallback guarantee

Every recording also captures `MediaRecorder` (web) or `AudioRecorder` file (mobile) at `250ms`/`HIGH_QUALITY`. If `isStopped` or `liveSessionRef` is null, or `liveTranscript` empty on `stop`, the `Blob` is posted to `/transcriptions`. This preserves function when live is misconfigured.

## 9. Security

* Supabase JWT in `?token=` is validated by `createAuthMiddleware` (`auth.ts:128`) before `providerRegistry` lookup. Google API key never touches browser.
* `STT_BRIDGE_URL` forwarding adds only `x-zoption-tenant` hash (8 chars) and `x-t-mic-start` — no PII, no transcript content to PostHog.

See also: `docs/realtime-stt-bridge.md` (chirp_3 bridge), `docs/assistant.md` (assistant consent), `apps/api/src/assistant/google-stt.ts` (REST path).
