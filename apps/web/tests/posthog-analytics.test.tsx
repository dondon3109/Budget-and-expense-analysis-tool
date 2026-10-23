// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, waitFor } from "@testing-library/react";
import posthog from "posthog-js";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  keepDashboardHeatmap,
  PostHogAnalytics,
  resetPostHogForTests,
  setAnalyticsAccount,
} from "../src/analytics/PostHogAnalytics";
import { createConsentRecord } from "@zoption/web-common/consent";
import { persistConsentRecord } from "@zoption/web-common/consent-storage";
import { resetConsentGateForTests, updateConsentGate } from "@zoption/web-common/consent-gate";

const POSTHOG_KEY = "phc_test_public_key_123";
const POSTHOG_HOST = "https://us.i.posthog.com";

vi.mock("posthog-js", () => {
  const capturedEvents: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  let initOptions: Record<string, unknown> | null = null;
  let initKey: string | null = null;

  return {
    default: {
      init: vi.fn((key: string, options: Record<string, unknown>) => {
        initKey = key;
        initOptions = options;
      }),
      capture: vi.fn((event: string, properties?: Record<string, unknown>) => {
        capturedEvents.push({ event, properties });
      }),
      reset: vi.fn(() => {
        capturedEvents.length = 0;
        initOptions = null;
        initKey = null;
      }),
      identify: vi.fn(),
      __getCapturedEvents: () => capturedEvents,
      __getInitOptions: () => initOptions,
      __getInitKey: () => initKey,
    },
  };
});

interface MockPostHog {
  init: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
  identify: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn<() => void>>;
  __getCapturedEvents: () => Array<{ event: string; properties?: Record<string, unknown> }>;
  __getInitOptions: () => Record<string, unknown> | null;
  __getInitKey: () => string | null;
}

const mockedPostHog = posthog as unknown as MockPostHog;

function pageviews() {
  return mockedPostHog.__getCapturedEvents().filter((event) => event.event === "$pageview");
}

/** Mirrors the provider: the decision is persisted first, then pushed into the gate. */
function storeAnalyticsConsent(analytics: boolean) {
  persistConsentRecord(createConsentRecord({ analytics, marketing: false }, "custom"));
  updateConsentGate({ analytics, marketing: false });
}

function AnalyticsApp({ initialEntry = "/" }: { initialEntry?: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <PostHogAnalytics />
      <Routes>
        <Route
          path="*"
          element={
            <nav>
              <Link to="/app">Private Dashboard</Link>
              <Link to="/app/transactions">Private Transactions</Link>
              <Link to="/login">Private Login</Link>
            </nav>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPostHog.reset();
  resetPostHogForTests();
  // Analytics is an optional integration: the component registers with the consent gate and
  // only starts PostHog once the analytics category is granted.
  resetConsentGateForTests();
  storeAnalyticsConsent(true);
  vi.stubEnv("VITE_POSTHOG_KEY", POSTHOG_KEY);
  vi.stubEnv("VITE_POSTHOG_HOST", POSTHOG_HOST);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockedPostHog.reset();
  resetPostHogForTests();
  resetConsentGateForTests();
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("PostHog Web Analytics", () => {
  it("initializes with a memory-only, identified-only configuration once consented", async () => {
    render(<AnalyticsApp initialEntry="/app" />);

    await waitFor(() => expect(mockedPostHog.init).toHaveBeenCalledTimes(1));

    expect(mockedPostHog.__getInitKey()).toBe(POSTHOG_KEY);
    expect(mockedPostHog.__getInitOptions()).toMatchObject({
      api_host: POSTHOG_HOST,
      persistence: "memory",
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      capture_heatmaps: true,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      capture_performance: {
        web_vitals: true,
        web_vitals_allowed_metrics: ["LCP", "CLS", "INP"],
      },
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
    });

    // Every app route is private; the public site on zoption.site counts its own pageviews.
    expect(pageviews()).toHaveLength(0);
  });

  it("reduces the URL and referrer posthog attaches to origin and path", async () => {
    render(<AnalyticsApp initialEntry="/app" />);
    await waitFor(() => expect(mockedPostHog.init).toHaveBeenCalledTimes(1));

    const options = mockedPostHog.__getInitOptions();
    const beforeSend = options?.before_send as (
      captureResult: {
        uuid: string;
        event: string;
        properties: Record<string, unknown>;
      } | null,
    ) => { properties: Record<string, unknown> } | null;
    expect(typeof beforeSend).toBe("function");

    // A private route can carry a bookmarked search filter or an identifier in its query
    // string, so neither URL may reach the analytics platform intact.
    expect(
      beforeSend({
        uuid: "uuid-1",
        event: "$pageview",
        properties: {
          $current_url: "https://app.zoption.site/app/transactions?search=rent%20gcash#txn-42",
          $referrer: "https://app.zoption.site/app?account=acct-1#top",
          distinct_id: "anonymous",
        },
      })?.properties,
    ).toEqual({
      $current_url: "https://app.zoption.site/app/transactions",
      $referrer: "https://app.zoption.site/app",
      distinct_id: "anonymous",
    });

    expect(
      beforeSend({
        uuid: "uuid-2",
        event: "$pageview",
        properties: { $referrer: "/app/import?search=rent" },
      })?.properties,
    ).toEqual({ $referrer: "/app/import" });
  });

  it("does not initialize or capture when VITE_POSTHOG_KEY is not configured", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    render(<AnalyticsApp initialEntry="/app" />);

    expect(mockedPostHog.init).not.toHaveBeenCalled();
    expect(mockedPostHog.__getCapturedEvents()).toHaveLength(0);
  });

  it("does not record pageviews when landing directly on private/authenticated routes", async () => {
    render(<AnalyticsApp initialEntry="/app" />);

    // Consent starts the SDK, but a private route never produces a pageview.
    expect(pageviews()).toHaveLength(0);
  });

  it("does not record pageviews when landing on authenticated subroutes or login", async () => {
    render(<AnalyticsApp initialEntry="/app/transactions" />);
    expect(pageviews()).toHaveLength(0);

    cleanup();
    render(<AnalyticsApp initialEntry="/login" />);
    expect(pageviews()).toHaveLength(0);
  });

  it("drops every event in the before_send hook once the consent is revoked", async () => {
    render(<AnalyticsApp initialEntry="/app" />);
    await waitFor(() => expect(mockedPostHog.init).toHaveBeenCalledTimes(1));

    // The real hook, not a mock: this is the only place that sees the SDK's own events too,
    // such as the web vitals capture_performance enables.
    const beforeSend = mockedPostHog.__getInitOptions()?.before_send as (
      captureResult: {
        uuid: string;
        event: string;
        properties: Record<string, unknown>;
      } | null,
    ) => { properties: Record<string, unknown> } | null;

    const event = {
      uuid: "uuid-1",
      event: "$web_vitals",
      properties: { $current_url: "https://app.zoption.site/app/transactions?search=rent" },
    };
    expect(beforeSend(event)?.properties).toEqual({
      $current_url: "https://app.zoption.site/app/transactions",
    });

    storeAnalyticsConsent(false);
    expect(beforeSend(event)).toBeNull();

    storeAnalyticsConsent(true);
    expect(beforeSend(event)).not.toBeNull();
  });

  it("identifies the signed-in account with its email once consented", async () => {
    storeAnalyticsConsent(false);
    setAnalyticsAccount({ id: "user-1", email: "person@example.com" });
    render(<AnalyticsApp initialEntry="/app" />);
    expect(mockedPostHog.identify).not.toHaveBeenCalled();

    storeAnalyticsConsent(true);
    await waitFor(() =>
      expect(mockedPostHog.identify).toHaveBeenCalledWith("user-1", {
        email: "person@example.com",
      }),
    );

    // The same account is identified once, and sign-out drops the identity.
    setAnalyticsAccount({ id: "user-1", email: "person@example.com" });
    expect(mockedPostHog.identify).toHaveBeenCalledTimes(1);
    mockedPostHog.reset.mockClear();
    setAnalyticsAccount(null);
    expect(mockedPostHog.reset).toHaveBeenCalledTimes(1);
  });

  it("clears the identity on revocation and identifies again when consent returns", async () => {
    setAnalyticsAccount({ id: "user-1" });
    render(<AnalyticsApp initialEntry="/app" />);
    await waitFor(() => expect(mockedPostHog.identify).toHaveBeenCalledWith("user-1", undefined));

    mockedPostHog.reset.mockClear();
    storeAnalyticsConsent(false);
    await waitFor(() => expect(mockedPostHog.reset).toHaveBeenCalledTimes(1));

    mockedPostHog.identify.mockClear();
    storeAnalyticsConsent(true);
    await waitFor(() => expect(mockedPostHog.identify).toHaveBeenCalledTimes(1));
    expect(pageviews()).toHaveLength(0);
  });
});

describe("keepDashboardHeatmap", () => {
  const point = { x: 10, y: 20, target_fixed: false, type: "click" };
  const heatmap = (data: Record<string, unknown>) =>
    ({ uuid: "u", event: "$$heatmap", properties: { $heatmap_data: data } }) as Parameters<
      typeof keepDashboardHeatmap
    >[0];

  it("keeps only the dashboard's points", () => {
    const result = keepDashboardHeatmap(
      heatmap({
        "https://app.zoption.site/app": [point],
        "https://app.zoption.site/app/transactions": [point],
      }),
    );
    expect(result?.properties.$heatmap_data).toEqual({ "https://app.zoption.site/app": [point] });
  });

  it("drops a heatmap event with no dashboard points", () => {
    expect(
      keepDashboardHeatmap(heatmap({ "https://app.zoption.site/app/settings": [point] })),
    ).toBeNull();
  });
});
