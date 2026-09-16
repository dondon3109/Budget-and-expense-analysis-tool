// @vitest-environment jsdom

import posthog from "posthog-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => {
  const capturedEvents: Array<{ event: string; properties?: Record<string, unknown> }> = [];

  return {
    default: {
      init: vi.fn(),
      capture: vi.fn((event: string, properties?: Record<string, unknown>) => {
        capturedEvents.push({ event, properties });
      }),
      reset: vi.fn(() => {
        capturedEvents.length = 0;
      }),
      __getCapturedEvents: () => capturedEvents,
    },
  };
});

import {
  captureFunnelEvent,
  resetFunnelForTests,
  type FunnelEventName,
  type FunnelEventProperties,
} from "../src/analytics/funnel";
import { resetPostHogForTests } from "../src/analytics/PostHogAnalytics";

const POSTHOG_KEY = "phc_test_public_key_123";

interface MockPostHog {
  init: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
  __getCapturedEvents: () => Array<{ event: string; properties?: Record<string, unknown> }>;
}

const mockedPostHog = posthog as unknown as MockPostHog;

const EVENT_PROPERTIES: { [Name in FunnelEventName]: FunnelEventProperties[Name] } = {
  signup_viewed: {},
  signup_submitted: { outcome: "confirmation_required" },
  app_session_started: {},
  first_import_committed: {},
  assistant_consent_granted: {},
  assistant_first_question: { surface: "chat" },
};

const EVENT_ENTRIES = Object.entries(EVENT_PROPERTIES) as Array<
  [FunnelEventName, FunnelEventProperties[FunnelEventName]]
>;

beforeEach(() => {
  vi.clearAllMocks();
  resetPostHogForTests();
  resetFunnelForTests();
  vi.stubEnv("VITE_POSTHOG_KEY", POSTHOG_KEY);
});

afterEach(() => {
  resetPostHogForTests();
  resetFunnelForTests();
  vi.unstubAllEnvs();
});

describe("funnel events", () => {
  // PostHog adds its own system properties on the wire, so these assert the
  // payload this module hands to posthog.capture.
  it("fires every event in the closed union with exactly its declared properties", () => {
    for (const [name, properties] of EVENT_ENTRIES) captureFunnelEvent(name, properties);

    expect(mockedPostHog.__getCapturedEvents()).toEqual(
      EVENT_ENTRIES.map(([event, properties]) => ({ event, properties })),
    );
  });

  it("drops any property key outside the event's fixed schema", () => {
    captureFunnelEvent("signup_submitted", {
      outcome: "signed_in",
      email: "person@example.com",
      amount_minor: 5_000,
      tenant_id: "user:1",
    } as FunnelEventProperties["signup_submitted"]);

    expect(mockedPostHog.__getCapturedEvents()).toEqual([
      { event: "signup_submitted", properties: { outcome: "signed_in" } },
    ]);
  });

  it("captures the first occurrence events once per page load", () => {
    captureFunnelEvent("app_session_started", {});
    captureFunnelEvent("app_session_started", {});
    captureFunnelEvent("first_import_committed", {});
    captureFunnelEvent("first_import_committed", {});
    captureFunnelEvent("assistant_first_question", { surface: "chat" });
    captureFunnelEvent("assistant_first_question", { surface: "voice" });
    captureFunnelEvent("signup_viewed", {});
    captureFunnelEvent("signup_viewed", {});

    expect(mockedPostHog.__getCapturedEvents()).toEqual([
      { event: "app_session_started", properties: {} },
      { event: "first_import_committed", properties: {} },
      { event: "assistant_first_question", properties: { surface: "chat" } },
      { event: "signup_viewed", properties: {} },
      { event: "signup_viewed", properties: {} },
    ]);
  });

  it("stays silent when no key is configured or when capture fails", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    expect(() => captureFunnelEvent("signup_viewed", {})).not.toThrow();
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(0);

    vi.stubEnv("VITE_POSTHOG_KEY", POSTHOG_KEY);
    mockedPostHog.capture.mockImplementationOnce(() => {
      throw new Error("PostHog is unreachable.");
    });
    expect(() => captureFunnelEvent("signup_viewed", {})).not.toThrow();
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(0);
  });
});
