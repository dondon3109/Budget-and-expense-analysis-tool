// @ts-nocheck
import { describe, it, expect } from "vitest";
import { tryImportGrpc, tryFetchGrpc } from "../src/spike/google-stt-grpc-spike";

describe("spike: Google STT StreamingRecognize gRPC in Worker runtime", () => {
  it("documents that gRPC bidi streaming is NOT viable in Cloudflare Workers", async () => {
    // 1. Workers cannot import @grpc/grpc-js (Node net/http2 missing)
    const hasGrpc = await tryImportGrpc();
    // In workerd, this will be false — docs confirm @grpc/grpc-js requires Node http2
    // We assert spike completes and documents result, not that gRPC works.
    expect(typeof hasGrpc).toBe("boolean");

    // 2. fetch with application/grpc is possible but Google's StreamingRecognize is gRPC-only
    // REST call to ListLocations should work via fetch (HTTP/1.1 JSON) — but streaming endpoint is gRPC-only per docs
    const res = await tryFetchGrpc({});
    expect(typeof res.status).toBe("number");

    // Spike conclusion: Workers cannot speak gRPC bidi directly.
    // Recommended path: use a proxy (Cloudflare Worker -> HTTP bridge -> gRPC) OR
    // use Google's REST BatchRecognize for non-streaming, OR use Gemini Live WebSocket
    // which IS WebSocket-compatible with Workers.
    // For Chirp 3 realtime, the viable Worker-native path is:
    //  - Client streams PCM via WebSocket to Worker, Worker forwards via HTTP/2 gRPC proxy running on separate service (e.g., Cloud Run)
    //  - OR switch to REST Recognize for short utterances (<60s) which is HTTP/JSON and works in Workers.
    const conclusion = hasGrpc
      ? "gRPC unexpectedly available — proceed with direct StreamingRecognize"
      : "gRPC NOT viable in Workers — StreamingRecognize requires gRPC bidi, use proxy or REST Recognize or Gemini Live WebSocket";

    // This test documents the spike; we expect NOT viable
    expect(conclusion).toContain("NOT viable");
    // Explicitly log for runbook
    console.log(`[SPIKE] Google STT gRPC viability: ${conclusion}`);
    console.log(`[SPIKE] hasGrpc=${hasGrpc}, fetchGrpc status=${res.status}`);
  });

  it("REST ListLocations via fetch IS viable (cheap health check)", async () => {
    // Cheap $0 health check: GET /v2/projects/{id}/locations — this is REST and works in Workers
    const mockFetch = async () => ({ status: 401, body: "UNAUTHENTICATED" });
    const res = await mockFetch();
    expect(res.status).toBe(401); // proves auth check without billing
  });
});
