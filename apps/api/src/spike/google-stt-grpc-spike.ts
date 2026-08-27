/**
 * Technical spike: Can Cloudflare Workers call Google Cloud Speech-to-Text V2 StreamingRecognize (gRPC-only)?
 *
 * Run with: pnpm --filter @zoption/api exec vitest run src/spike/google-stt-grpc-spike.test.ts
 * Or manually via workerd.
 *
 * Goals per architecture requirement #11:
 * - Prove whether gRPC bidi streaming is viable in the Worker runtime.
 * - Document fallback if not viable.
 */

export interface SpikeResult {
  grpcAvailable: boolean;
  http2Available: boolean;
  fetchGrpcAttempt?: { status: number; body: string };
  canImportGrpc?: boolean;
  error?: string;
}

/**
 * Attempt 1: try to import @grpc/grpc-js (Node gRPC). Workers lack Node net/http2.
 */
export async function tryImportGrpc(): Promise<boolean> {
  try {
    // Dynamic import so bundler doesn't fail at build if not installed
    // @ts-ignore - optional dependency for spike only
    await import("@grpc/grpc-js");
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Attempt 2: try fetch with application/grpc to speech.googleapis.com
 * This proves whether Workers can even speak gRPC framing.
 */
export async function tryFetchGrpc(env: { GOOGLE_STT_PROJECT_ID?: string }): Promise<SpikeResult["fetchGrpcAttempt"]> {
  // Use a known REST endpoint that should return 401 without auth, but proves fetch works
  // For gRPC, we try the gRPC endpoint with wrong content-type
  try {
    const res = await fetch("https://speech.googleapis.com/v2/projects/test/locations", {
      method: "GET",
      headers: { "Content-Type": "application/grpc" },
    });
    const body = await res.text().catch(() => "");
    return { status: res.status, body: body.slice(0, 500) };
  } catch (e) {
    return { status: 0, body: String(e).slice(0, 500) };
  }
}

/**
 * Attempt 3: check if Node http2 is available in Workerd
 */
export function checkHttp2(): boolean {
  try {
    // @ts-ignore - check runtime
    const hasHttp2 = typeof (globalThis as unknown as Record<string, unknown>)["http2"] !== "undefined";
    return hasHttp2;
  } catch {
    return false;
  }
}
