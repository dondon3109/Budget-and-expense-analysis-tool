// @vitest-environment jsdom

import { gunzipSync } from "node:zlib";

import type { PostHog } from "posthog-js";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as PostHogAnalyticsModule from "../src/analytics/PostHogAnalytics";
import { CONSENT_STORAGE_KEY, createConsentRecord } from "@zoption/web-common/consent";

const POSTHOG_KEY = "phc_test_public_key_123";
const POSTHOG_HOST = "https://us.i.posthog.com";
/** A private route can carry a bookmarked filter or a record id, hence both a query and a fragment. */
const PRIVATE_ROUTE = "/app/transactions?search=rent#txn-42";
const PRIVATE_REFERRER = "https://app.zoption.site/app?account=acct-1#top";

interface CapturedEvent {
  event: string;
  properties: Record<string, unknown>;
}

interface CapturedPayload {
  api_key: string;
  batch: CapturedEvent[];
}

const outboundRequests: Array<{ url: string; body: unknown }> = [];

// posthog-js snapshots globalThis.fetch the moment the SDK module evaluates, so this stub has to be
// in place before ../src/analytics/PostHogAnalytics (and therefore posthog-js) is imported. That is
// why both imports below are dynamic rather than static.
vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
  outboundRequests.push({ url: String(input), body: init?.body ?? null });
  return Promise.resolve({ status: 200, text: () => Promise.resolve("{}") } as Response);
});

let analytics: typeof PostHogAnalyticsModule;
let posthog: PostHog;

beforeEach(async () => {
  outboundRequests.length = 0;
  // Every outbound event is gated on the stored analytics decision, so these cases run as a
  // visitor who granted it; without the record the SDK would hand nothing to its transport.
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify(createConsentRecord({ analytics: true, marketing: false }, "custom")),
  );
  vi.stubEnv("VITE_POSTHOG_KEY", POSTHOG_KEY);
  vi.stubEnv("VITE_POSTHOG_HOST", POSTHOG_HOST);
  window.history.replaceState({}, "", PRIVATE_ROUTE);
  Object.defineProperty(document, "referrer", { configurable: true, value: PRIVATE_REFERRER });

  posthog = (await import("posthog-js")).default;
  analytics = await import("../src/analytics/PostHogAnalytics");
});

afterEach(() => {
  posthog.reset();
  analytics.resetPostHogForTests();
  vi.unstubAllEnvs();
  localStorage.clear();
  Reflect.deleteProperty(document, "referrer");
  window.history.replaceState({}, "", "/");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** The SDK gzips the capture batch, so decode the exact bytes the transport was handed. */
function decodeRequestBody(body: unknown): CapturedPayload {
  const json =
    typeof body === "string"
      ? body
      : body instanceof ArrayBuffer
        ? gunzipSync(new Uint8Array(body)).toString("utf8")
        : undefined;
  if (json === undefined) {
    throw new Error(`Unexpected PostHog request body: ${Object.prototype.toString.call(body)}`);
  }
  return JSON.parse(json) as CapturedPayload;
}

/** Captures a pageview and returns it as the SDK's transport saw it. */
async function capturePageview() {
  posthog.capture("$pageview", { source: "web" }, { send_instantly: true });
  await vi.waitFor(() => expect(outboundRequests.length).toBeGreaterThan(0));

  const request = outboundRequests[0];
  const payload = decodeRequestBody(request?.body);
  const event = payload.batch.find((entry) => entry.event === "$pageview");
  if (!event) {
    throw new Error("The PostHog capture payload did not include the $pageview event");
  }

  return { url: request?.url, payload, event };
}

describe("PostHog outbound payload", () => {
  it("sends no query string or fragment in $current_url or $referrer", async () => {
    expect(analytics.ensurePostHogInitialized()).toBe(true);
    const { url, payload, event } = await capturePageview();

    // This came out of PostHog's real capture transport, for this project.
    expect(url).toContain(POSTHOG_HOST);
    expect(payload.api_key).toBe(POSTHOG_KEY);

    // The location and referrer the SDK built its properties from really did carry both parts, so
    // the assertions below cannot pass merely because there was nothing to strip.
    expect(window.location.href).toBe(`http://localhost:3000${PRIVATE_ROUTE}`);
    expect(document.referrer).toBe(PRIVATE_REFERRER);

    expect(event.properties.$current_url).toBe("http://localhost:3000/app/transactions");
    expect(event.properties.$referrer).toBe("https://app.zoption.site/app");
    expect(event.properties.source).toBe("web");
  });

  it("sends an exception as its class and code locations, never its message", async () => {
    expect(analytics.ensurePostHogInitialized()).toBe(true);
    const secret = "Rent to Juan Dela Cruz 15000";
    const error = new TypeError(secret, { cause: new Error(`cause: ${secret}`) });
    // $exception goes out in a batch; send it now so the transport can be read.
    posthog.set_config({ request_batching: false });

    analytics.captureAppException(error, "app-error-boundary");
    await vi.waitFor(() => expect(outboundRequests.length).toBeGreaterThan(0));

    const body = decodeRequestBody(outboundRequests[0]?.body);
    const event = body.batch.find((entry) => entry.event === "$exception");
    if (!event) throw new Error("The PostHog capture payload did not include $exception");

    expect(JSON.stringify(body)).not.toContain("Juan");
    expect(event.properties.source).toBe("app-error-boundary");
    const list = event.properties.$exception_list as Array<{
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ lineno?: number }> };
    }>;
    expect(list.map(({ type, value }) => [type, value])).toEqual([
      ["TypeError", "TypeError"],
      ["Error", "Error"],
    ]);
    expect(list[0]?.stacktrace?.frames.length).toBeGreaterThan(0);
    posthog.set_config({ request_batching: true });
  });

  it("autocaptures an uncaught error from the bundled extension", async () => {
    expect(analytics.ensurePostHogInitialized()).toBe(true);
    posthog.set_config({ request_batching: false });

    // The extension wraps window.onerror; calling it directly keeps jsdom from also
    // failing the run with the uncaught error.
    window.onerror?.("Uncaught RangeError", "app.js", 1, 1, new RangeError("balance 15000"));
    await vi.waitFor(() => expect(outboundRequests.length).toBeGreaterThan(0));

    const body = decodeRequestBody(outboundRequests[0]?.body);
    const event = body.batch.find((entry) => entry.event === "$exception");
    expect(event?.properties.$exception_list).toMatchObject([
      { type: "RangeError", value: "RangeError" },
    ]);
    expect(JSON.stringify(body)).not.toContain("15000");
    posthog.set_config({ request_batching: true });
  });

  it("control: without before_send the same SDK hands the raw private URL to its transport", async () => {
    expect(analytics.ensurePostHogInitialized()).toBe(true);

    // Test-only control: it shows the reduction above happens inside the SDK's before_send hook and
    // not elsewhere in the SDK. The app's own configuration in PostHogAnalytics.tsx is untouched.
    posthog.set_config({ before_send: [] });
    const { event } = await capturePageview();

    expect(event.properties.$current_url).toBe(`http://localhost:3000${PRIVATE_ROUTE}`);
    expect(event.properties.$referrer).toBe(PRIVATE_REFERRER);

    // Put the app's hook back so this case cannot leak into a later one.
    posthog.set_config({ before_send: analytics.sanitizeAnalyticsEvent });
  });
});
