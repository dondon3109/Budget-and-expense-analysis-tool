import { WebSocketServer } from "ws";
import http from "node:http";

// Lazy import google speech to keep spike runnable without credentials
let SpeechClient;
try {
  const mod = await import("@google-cloud/speech");
  SpeechClient = mod.v2?.SpeechClient ?? mod.SpeechClient;
} catch {
  SpeechClient = null;
}

const PORT = Number(process.env.PORT || 8080);
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || "";
const LOCATION = process.env.SPEECH_LOCATION || "us";

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "stt-bridge", model: "chirp_3", location: LOCATION }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/stream" });

wss.on("connection", (ws, req) => {
  const tStreamOpen = Date.now();
  let speechClient = null;
  let recognizeStream = null;
  let firstPartialSent = false;
  const tMicStartHeader = req.headers["x-t-mic-start"];
  const tMicStart = tMicStartHeader ? Number(tMicStartHeader) : tStreamOpen;

  // Instrumentation
  ws.send(JSON.stringify({ type: "bridge_open", t_stream_open: tStreamOpen, t_mic_start: tMicStart, latency_mic_to_stream: tStreamOpen - tMicStart }));

  // If no Google creds or client unavailable, run mock partials for spike
  const useMock = !SpeechClient || !PROJECT_ID;

  if (!useMock) {
    try {
      speechClient = new SpeechClient({ apiEndpoint: `${LOCATION}-speech.googleapis.com` });
      // gRPC stream will be created lazily on first config message
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", code: "bridge_init_failed", message: String(e).slice(0, 200) }));
      ws.close();
      return;
    }
  }

  ws.on("message", async (data, isBinary) => {
    if (!isBinary) {
      // JSON control
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "config" || msg.config) {
          const model = msg.config?.model || msg.model || "chirp_3";
          const language = msg.config?.language || "en-US";
          if (useMock) {
            ws.send(JSON.stringify({ type: "config_ack", model, location: LOCATION, mock: true }));
            return;
          }
          // Create gRPC bidi stream
          const recognizer = `projects/${PROJECT_ID}/locations/${LOCATION}/recognizers/_`;
          recognizeStream = speechClient.streamingRecognize();
          recognizeStream.on("data", (resp) => {
            const result = resp.results?.[0];
            if (!result) return;
            const transcript = result.alternatives?.[0]?.transcript || "";
            const isFinal = Boolean(result.isFinal);
            const now = Date.now();
            if (!firstPartialSent && !isFinal) {
              firstPartialSent = true;
              ws.send(JSON.stringify({ type: "partial", transcript, isFinal: false, t_first_partial: now, latency_mic_to_first_partial: now - tMicStart, latency_stream_to_first_partial: now - tStreamOpen }));
            } else if (isFinal) {
              ws.send(JSON.stringify({ type: "final", transcript, isFinal: true, t_final: now, latency_mic_to_final: now - tMicStart }));
            } else {
              ws.send(JSON.stringify({ type: "partial", transcript, isFinal: false, t_first_partial: now }));
            }
          });
          recognizeStream.on("error", (err) => {
            ws.send(JSON.stringify({ type: "error", code: "google_stream_error", message: String(err.message).slice(0, 300), status: err.code }));
          });
          // First message: config
          recognizeStream.write({
            recognizer,
            streamingConfig: {
              config: {
                autoDecodingConfig: {},
                languageCodes: [language],
                model,
              },
            },
          });
          ws.send(JSON.stringify({ type: "config_ack", model, location: LOCATION }));
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", code: "bad_config", message: String(e).slice(0, 200) }));
      }
      return;
    }

    // Binary audio chunk
    if (useMock) {
      // Mock: after first chunk, emit partial after 180ms, final after 600ms
      if (!firstPartialSent) {
        firstPartialSent = true;
        setTimeout(() => {
          const now = Date.now();
          ws.send(JSON.stringify({ type: "partial", transcript: "mock partial (chirp_3)", isFinal: false, t_first_partial: now, latency_mic_to_first_partial: now - tMicStart }));
        }, 180);
        setTimeout(() => {
          const now = Date.now();
          ws.send(JSON.stringify({ type: "final", transcript: "mock final transcript", isFinal: true, t_final: now, latency_mic_to_final: now - tMicStart }));
        }, 600);
      }
      return;
    }

    // Forward to Google gRPC
    if (recognizeStream) {
      recognizeStream.write({ audio: data });
    }
  });

  ws.on("close", () => {
    if (recognizeStream) {
      try { recognizeStream.end(); } catch {}
    }
  });
});

server.listen(PORT, () => {
  console.log(`stt-bridge listening on :${PORT} (mock=${!SpeechClient || !PROJECT_ID}, location=${LOCATION})`);
});
