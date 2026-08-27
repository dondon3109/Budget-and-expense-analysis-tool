# STT Bridge — Cloud Run gRPC proxy for Chirp 3

**Purpose:** Terminate browser `WSS` from Worker, bridge to `speech.googleapis.com` `StreamingRecognize` (gRPC bidi) with `model=chirp_3`. Keeps Google SA auth inside Cloud Run (ADC), not forwarded from Worker.

**Run locally (mock, no GCP creds):**
```bash
npm install
PORT=8080 node server.js
# mock partials emitted 180ms/600ms, health at /healthz
```

**Run with real Google:**
```bash
gcloud auth application-default login
GOOGLE_CLOUD_PROJECT=my-project SPEECH_LOCATION=us node server.js
# or deploy:
gcloud run deploy stt-bridge --source . --region us-central1 --allow-unauthenticated --set-env-vars SPEECH_LOCATION=us --service-account stt-bridge@my-project.iam.gserviceaccount.com
```

**Protocol:**
- `Browser → Bridge` JSON `{type:"config", config:{model:"chirp_3", language:"en-US"}}` then binary PCM chunks
- `Bridge → Browser` `{type:"partial", transcript, isFinal:false, t_first_partial, latency_*}` / `{type:"final"}`
- Worker proxies, adds `x-t-mic-start` header for `mic→stream` measurement.

**Latency instrumentation:** `t_mic_start` (client), `t_stream_open` (bridge), `t_first_partial`, `t_final` — all forwarded, never logs transcript content per `docs/assistant.md:107`.

**Cost:** Chirp 3 `$0.024/min` + Run `~$5-25/mo` for Zoption scale.
