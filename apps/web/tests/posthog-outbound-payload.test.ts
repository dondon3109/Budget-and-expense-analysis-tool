// @vitest-environment jsdom

import { gunzipSync } from "node:zlib";

import type { PostHog } from "posthog-js";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as PostHogAnalyticsModule from "../src/analytics/PostHogAnalytics";

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
