# Realtime STT Bridge — Chirp 3 Streaming Architecture

**Status:** Approved option (2) — Cloud Run bridge. REST `Recognize` kept as health-check only (`apps/api/src/assistant/google-stt.ts:1`).

## Authentication decision (correction 11)

**Preferred: Google Cloud auth stays inside Cloud Run via ADC/service account.**

* Cloud Run service `stt-bridge` runs with attached GCP service account `stt-bridge@PROJECT.iam.gserviceaccount.com` having `roles/speech.client` (`speech.recognizers.recognize`, `speech.config.get`).
* It authenticates to `speech.googleapis.com` via Application Default Credentials (ADC) — no SA JSON in D1, no secret forwarded `Worker → Run`.
* **Why not forward admin credential:** Admin-managed `provider_credentials` for `google` (encrypted AES-256-GCM, `apps/api/src/provider-credentials/crypto.ts:40`) would require decrypting in Worker (`provider-registry.ts:81` `resolveCredential`) and forwarding SA JSON/token over `WSS` to Run. That increases exposure (plaintext in Worker memory twice, in transit, in Run logs risk) and couples UI credential rotation to Run redeploy. It does **not** satisfy the “switch production provider” requirement — switching is via `provider_configs.is_active` + `providerRegistry.invalidate()` (`apps/api/src/provider-registry.ts:298`), not SA rotation.
* **Health check still uses admin credential optionally:** `POST /provider-credentials/:id/test` decrypts and does `GET /v2/projects/{id}/locations?pageSize=1` (`Authorization: Bearer`) — proves SA JSON validity with $0, but **not** used for realtime streaming. Realtime streaming uses Run ADC.
* **Never exposed:** Plaintext/Google SA JSON never in browser, localStorage, React Query, URL, `provider_config_audits` (`apps/api/src/db/provider-configs.ts:85`), logs, PostHog.

If multi-project per credential is later required, add `provider_credentials` field `gcpProjectId` and forward *only projectId* (not SA JSON) to Run; Run can assume impersonation via `gcloud auth impersonate` — still no SA JSON transit.

## End-to-end path (correction 13, streaming partials)

```
Browser mic (MediaStream 16k PCM, AudioWorklet, 25KB chunks)
  --WSS (authenticated)--> Cloudflare Worker GET /api/app/assistant/voice/stream
       auth: Supabase JWT (existing middleware `apps/api/src/app.ts:394`), rate-limit `tenant-assistant-voice-transcription:*`
       authorize: getActive stt config `providerRegistry.getActive(env,'stt')` — global, affects all users
       if provider !== google → fallback to existing POST /transcriptions (Whisper)
       else open WSS to Cloud Run `wss://stt-bridge-xxx.run.app/stream` with header `x-zoption-tenant: hash(tenantId)` (no PII)
  --WSS--> Cloud Run Bridge (Node, @google-cloud/speech V2)
       on first client message {config:{model:"chirp_3",language:"en-US",location:"us"}}
       → gRPC bidi `client.streamingRecognize()` first message = StreamingRecognitionConfig{config:{autoDecodingConfig:{}, languageCodes:["en-US","auto"], model:"chirp_3"}}
       → subsequent messages = {audioContent: base64Chunk}
       <--Google interim {results:[{alternatives:[{transcript}], isFinal:false}]} 150-300ms
       <--Google final  {isFinal:true}
       → WSS back to Worker → browser {type:"partial"|"final", transcript, t_*}
  --> Worker → existing voice flow (transcript → assistant tools, same as Whisper `assistant/voice-service.ts:223`)
```

* **Streaming:** Browser sends `AudioWorklet` PCM every 100ms (not buffered file). Worker forwards immediately — **no buffering** until `final`. Interim `isFinal:false` rendered grey, `final` commits.
* **REST kept only for:** `GET /v2/.../locations` health check (cheap) and fallback for <60s buffered uploads if WS unavailable.

## Latency instrumentation (correction instrumentation)

Client + Worker + Bridge emit `t_*` monotonic `performance.now()` (browser) / `Date.now()` (edge):

* `t_mic_start` — first `getUserMedia` sample queued
* `t_stream_open` — Bridge gRPC `streamingRecognize` opened (first `StreamingRecognitionConfig` sent)
* `t_first_partial` — first `isFinal:false` received
* `t_final` — `isFinal:true` received

Derived: `mic→stream = t_stream_open - t_mic_start` (should <100ms), `mic→firstPartial = t_first_partial - t_mic_start` (target <400ms Chirp 3 vs Whisper POST ~1200ms), `firstPartial→final`.

Measurements forwarded as `X-Latency-*` headers + PostHog metadata (no transcript content, per `docs/assistant.md:107`).

Comparison harness: same utterance recorded twice — once via `POST /transcriptions` (Whisper) timed, once via `WSS /stream` — log both latencies.

## Components kept unchanged

* `provider_credentials/provider_configs` separated, encrypted, reusable, `apiKeyLast4` only (`db/schema.ts:1003`). No change.
* Manual `activate` → `registry.invalidate(service)` immediate (`provider-registry.ts:298`) — 30s TTL is fallback only.
* Terminology `Credential/Secret` (`AdminProviderConfigsPage.tsx:1`).
* Provider match enforcement `admin-provider-configs.ts:81`.
* Gemini Live **not** in this phase (future `assistant.gemini-live` provider).

## Bridge skeleton (spike, not yet deployed)

* `apps/stt-bridge/` Node `ws` + `@google-cloud/speech` V2, Dockerfile, `PORT=8080`, `minInstances=0`, `maxInstances=3`, `concurrency=100`.
* Env `GOOGLE_CLOUD_PROJECT`, `SPEECH_LOCATION=us`. No secret env — uses attached SA.
* Cost: Speech `chirp_3 $0.024/min` + Run `~$5-25/mo` at <10k min. No D1 extra.
