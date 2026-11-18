import { MobileSyncTransportError } from "@/api/mobile-sync";

/** Longest single wait inside a run; a longer Retry-After ends the run and retries later. */
const MAX_WAIT_SECONDS = 60;
/** Waits per request before the run gives up and reports the rate limit. */
const MAX_WAITS = 3;
/** Used when the Worker's 429 carries no Retry-After. */
const DEFAULT_WAIT_SECONDS = 5;

/** How long to hold off after a 429, in seconds, clamped to 1..cap. */
export function rateLimitDelaySeconds(
  error: MobileSyncTransportError,
  cap = MAX_WAIT_SECONDS,
): number {
  return Math.min(Math.max(error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS, 1), cap);
}

function abortError(): Error {
  const error = new Error("Synchronization was cancelled.");
  error.name = "AbortError";
  return error;
}

function delay(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs one sync request and waits out a 429 before repeating it. A first sync on a new phone
 * pulls page after page and can outpace the Worker's per-minute budget; waiting keeps the run
 * going instead of stopping half synced. Any other error, a wait past the cap, or a fourth 429
 * propagates. Aborting the run cancels the wait.
 */
export async function withRateLimitWait<T>(
  signal: AbortSignal,
  call: () => Promise<T>,
): Promise<T> {
  for (let waits = 0; ; waits += 1) {
    try {
      return await call();
    } catch (error) {
      if (
        !(error instanceof MobileSyncTransportError) ||
        error.code !== "rate_limited" ||
        waits >= MAX_WAITS ||
        (error.retryAfterSeconds ?? 0) > MAX_WAIT_SECONDS
      ) {
        throw error;
      }
      await delay(signal, rateLimitDelaySeconds(error) * 1000);
    }
  }
}
